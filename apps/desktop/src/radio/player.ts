// Eternal Radio player: schedules bars a little ahead of time (lookahead scheduler), handles
// play/pause/next/previous/seek and volume, and shows up in the island like any other music.
import { create } from 'zustand';
import { TRACKS, type Track } from './tracks';
import { bars, barSeconds, createMixer, scheduleBar, trackSeconds, type Mixer } from './engine';

interface RadioState {
  index: number;
  playing: boolean;
  /** Seconds into the track. */
  position: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  /** 0–1 levels for a small visualiser. */
  levels: number[];
}

export const useRadio = create<RadioState>(() => ({ index: 0, playing: false, position: 0, duration: trackSeconds(TRACKS[0]), volume: 0.8, shuffle: false, levels: [] }));

let ctx: AudioContext | null = null;
let mixer: Mixer | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let nextBar = 0;
let nextTime = 0;
let startedAt = 0; // ctx time when bar 0 would have started
let levelsTimer: ReturnType<typeof setInterval> | undefined;

export const currentTrack = (): Track => TRACKS[useRadio.getState().index];

function stopScheduler() {
  clearInterval(timer);
  timer = undefined;
  clearInterval(levelsTimer);
  levelsTimer = undefined;
}

/** Fades out and drops the current mix (scheduled notes stop with it). */
function dropMixer() {
  if (!mixer || !ctx) return;
  const old = mixer;
  const t = ctx.currentTime;
  old.master.gain.cancelScheduledValues(t);
  old.master.gain.setValueAtTime(old.master.gain.value, t);
  old.master.gain.linearRampToValueAtTime(0.0001, t + 0.35);
  setTimeout(() => old.master.disconnect(), 450);
  mixer = null;
}

function startAt(barIndex: number) {
  if (!ctx) ctx = new AudioContext();
  void ctx.resume();
  const track = currentTrack();
  dropMixer();
  mixer = createMixer(ctx, track);
  mixer.master.gain.value = useRadio.getState().volume;
  const all = bars(track);
  const bs = barSeconds(track);
  nextBar = Math.max(0, Math.min(barIndex, all.length - 1));
  nextTime = ctx.currentTime + 0.08;
  startedAt = nextTime - nextBar * bs;
  stopScheduler();
  timer = setInterval(() => {
    if (!ctx || !mixer) return;
    while (nextTime < ctx.currentTime + 0.25) {
      if (nextBar >= all.length) {
        // End of the track: move on after the last bar rings out.
        if (ctx.currentTime > nextTime + 0.5) return void next(true);
        return;
      }
      scheduleBar(mixer, track, all[nextBar], nextTime);
      nextBar++;
      nextTime += bs;
    }
    useRadio.setState({ position: Math.min(trackSeconds(track), ctx.currentTime - startedAt) });
  }, 40);
  const data = new Uint8Array(mixer.analyser.frequencyBinCount);
  levelsTimer = setInterval(() => {
    if (!mixer) return;
    mixer.analyser.getByteFrequencyData(data);
    useRadio.setState({ levels: [2, 4, 7, 11, 15].map((i) => data[i] / 255) });
  }, 90);
  useRadio.setState({ playing: true, duration: trackSeconds(track) });
}

export function play() {
  const s = useRadio.getState();
  const bs = barSeconds(currentTrack());
  startAt(Math.floor(s.position / bs));
}

export function pause() {
  stopScheduler();
  dropMixer();
  useRadio.setState({ playing: false, levels: [] });
}

export function toggle() {
  if (useRadio.getState().playing) pause();
  else play();
}

export function select(index: number, autoplay = true) {
  const i = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
  useRadio.setState({ index: i, position: 0, duration: trackSeconds(TRACKS[i]) });
  if (autoplay) startAt(0);
  else pause();
}

export function next(auto = false) {
  const s = useRadio.getState();
  const i = s.shuffle && auto ? Math.floor(Math.random() * TRACKS.length) : s.index + 1;
  select(i, s.playing || auto);
}

export function previous() {
  const s = useRadio.getState();
  // Like most players: restart the track unless we're at its very beginning.
  if (s.position > 4) return select(s.index, s.playing);
  select(s.index - 1, s.playing);
}

export function seek(fraction: number) {
  const s = useRadio.getState();
  const track = currentTrack();
  const pos = Math.max(0, Math.min(1, fraction)) * trackSeconds(track);
  useRadio.setState({ position: pos });
  if (s.playing) startAt(Math.floor(pos / barSeconds(track)));
}

export function setVolume(v: number) {
  const vol = Math.max(0, Math.min(1, v));
  useRadio.setState({ volume: vol });
  if (mixer && ctx) mixer.master.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
}

/** A liquid-glass cover for a track, as an SVG data URL (also used by the island). */
export function coverArt(t: Track, size = 240) {
  const [a, b, c] = t.colors;
  // Soft colour blobs made with radial gradients (no blur filter, so it paints instantly everywhere).
  const blob = (id: string, col: string, op: number) => `<radialGradient id="${id}"><stop offset="0" stop-color="${col}" stop-opacity="${op}"/><stop offset=".55" stop-color="${col}" stop-opacity="${op * 0.55}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#0b0b12"/></linearGradient>${blob('a', a, 0.95)}${blob('b', b, 0.9)}${blob('w', '#fff', 0.4)}</defs><rect width="100" height="100" fill="url(#g)"/><circle cx="30" cy="35" r="44" fill="url(#a)"/><circle cx="72" cy="62" r="42" fill="url(#b)"/><circle cx="55" cy="22" r="24" fill="url(#w)"/><rect x="6" y="6" width="88" height="88" rx="18" fill="none" stroke="#fff" stroke-opacity=".28"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
