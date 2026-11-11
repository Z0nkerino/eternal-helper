// Screen recording. Windows: the webview (WebView2) captures with getDisplayMedia + MediaRecorder and streams
// 1-second chunks to Rust, which writes them straight to the file. macOS: the native `screencapture` tool.
import { appendChunk, call, type Recording } from './ipc';
import { tNow } from './i18n';
import { recElapsed, toast, useApp } from './store';

let recorder: MediaRecorder | null = null;
let streams: MediaStream[] = [];
let audioCtx: AudioContext | null = null;
let recId = '';
let writes: Promise<unknown> = Promise.resolve();

const MIME = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

function pickMime() {
  return MIME.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

const setRec = (patch: Partial<ReturnType<typeof useApp.getState>['rec']>) => useApp.setState((s) => ({ rec: { ...s.rec, ...patch } }));

function cleanup() {
  streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  streams = [];
  void audioCtx?.close();
  audioCtx = null;
  recorder = null;
}

/** System audio from the shared screen, optionally mixed with the microphone. */
async function buildStream(display: MediaStream, withMic: boolean): Promise<MediaStream> {
  if (!withMic) return display;
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => null);
  if (!mic) return display;
  streams.push(mic);
  audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  for (const s of [display, mic]) if (s.getAudioTracks().length) audioCtx.createMediaStreamSource(s).connect(dest);
  return new MediaStream([...display.getVideoTracks(), ...dest.stream.getAudioTracks()]);
}

export async function startRecording() {
  const st = useApp.getState();
  if (st.rec.status !== 'idle') return;
  const audio = st.settings?.recording.audio ?? 'system';
  const native = !!st.layout?.nativeRecording;
  setRec({ status: 'starting', native, pausedMs: 0 });
  try {
    if (native) {
      await call('rec_native_start', { mic: audio === 'system+mic' });
      setRec({ status: 'recording', startedAt: Date.now() });
      return;
    }
    const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: audio !== 'none' });
    streams.push(display);
    const stream = await buildStream(display, audio === 'system+mic');
    const mimeType = pickMime();
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    recId = await call('rec_begin', { ext });
    writes = Promise.resolve();
    recorder = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      const id = recId;
      // Chunks are written strictly in order.
      writes = writes.then(async () => appendChunk(id, new Uint8Array(await e.data.arrayBuffer())));
    };
    // "Stop sharing" in the system bar ends the recording too.
    display.getVideoTracks()[0]?.addEventListener('ended', () => void stopRecording());
    recorder.start(1000);
    setRec({ status: 'recording', startedAt: Date.now() });
  } catch (e) {
    cleanup();
    if (recId) void call('rec_cancel', { id: recId });
    recId = '';
    setRec({ status: 'idle' });
    // Cancelling the system picker isn't an error worth a toast.
    if ((e as DOMException)?.name !== 'NotAllowedError') toast(`${tNow('rec.failed')}: ${String((e as Error)?.message ?? e)}`, { tone: 'error' });
  }
}

export function pauseRecording() {
  const r = useApp.getState().rec;
  if (r.native || !recorder) return;
  if (r.status === 'recording') {
    recorder.pause();
    setRec({ status: 'paused', pausedAt: Date.now() });
  } else if (r.status === 'paused') {
    recorder.resume();
    setRec({ status: 'recording', pausedMs: r.pausedMs + (Date.now() - r.pausedAt), pausedAt: 0 });
  }
}

export async function stopRecording(): Promise<Recording | null> {
  const r = useApp.getState().rec;
  if (r.status !== 'recording' && r.status !== 'paused') return null;
  const durationMs = recElapsed(r);
  setRec({ status: 'saving' });
  try {
    let saved: Recording;
    if (r.native) {
      saved = await call('rec_native_stop');
    } else {
      const rec = recorder!;
      await new Promise<void>((resolve) => {
        rec.addEventListener('stop', () => resolve(), { once: true });
        rec.stop();
      });
      await writes;
      saved = await call('rec_finish', { id: recId, durationMs });
    }
    toast(tNow('rec.saved'), {
      tone: 'ok',
      force: true,
      action: { label: tNow('rec.play'), run: () => void call('rec_open', { path: saved.path, reveal: false }) },
    });
    return saved;
  } catch (e) {
    toast(`${tNow('rec.failed')}: ${String(e)}`, { tone: 'error' });
    return null;
  } finally {
    cleanup();
    recId = '';
    setRec({ status: 'idle', startedAt: 0, pausedMs: 0, pausedAt: 0 });
  }
}

export function toggleRecording() {
  const s = useApp.getState().rec.status;
  if (s === 'idle') void startRecording();
  else if (s === 'recording' || s === 'paused') void stopRecording();
}

export const fmtDuration = (ms: number) => {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

export const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
