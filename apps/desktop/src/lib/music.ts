// One "now playing" for the island, from two sources: the system media session (any player app) and the
// web players of signed-in music accounts (Spotify, Yandex Music, SoundCloud). Whatever plays wins.
import { call, listen, type MediaInfo, type MusicReport } from './ipc';
import { useApp, type MediaSource } from './store';
import { rememberTrack } from './recent';
import { coverArt, currentTrack, next as radioNext, previous as radioPrev, seek as radioSeek, toggle as radioToggle, useRadio } from '../radio/player';

export const SERVICE_NAMES: Record<MusicReport['service'], string> = { spotify: 'Spotify', yandex: 'Yandex Music', soundcloud: 'SoundCloud', youtube: 'YouTube Music' };

export function pickMedia(system: MediaInfo | null, web: Partial<Record<MusicReport['service'], MusicReport>>): { media: MediaInfo | null; source: MediaSource } {
  const reports = Object.values(web).filter((r): r is MusicReport => !!r && !!r.title);
  const toMedia = (r: MusicReport): MediaInfo => ({ title: r.title, artist: r.artist, album: r.album, playing: r.playing, source: SERVICE_NAMES[r.service], artwork: r.artwork, positionMs: r.positionMs, durationMs: r.durationMs });
  const playingWeb = reports.find((r) => r.playing);
  if (playingWeb) return { media: toMedia(playingWeb), source: { kind: 'web', service: playingWeb.service } };
  if (system?.playing) return { media: system, source: { kind: 'system' } };
  if (system) return { media: system, source: { kind: 'system' } };
  if (reports[0]) return { media: toMedia(reports[0]), source: { kind: 'web', service: reports[0].service } };
  return { media: null, source: { kind: 'system' } };
}

/** Eternal Radio as a media source, while it plays (or is paused mid-track). */
function radioMedia(): MediaInfo | null {
  const r = useRadio.getState();
  if (!r.playing && r.position === 0) return null;
  const t = currentTrack();
  return { title: t.title, artist: 'Eternal Inc.', album: 'Eternal Radio', playing: r.playing, source: 'Eternal Radio', artwork: coverArt(t, 120), positionMs: r.position * 1000, durationMs: r.duration * 1000 };
}

function recompute() {
  const s = useApp.getState();
  const radio = radioMedia();
  if (radio?.playing || (radio && !s.systemMedia?.playing && !Object.values(s.webMusic).some((r) => r?.playing))) {
    useApp.setState({ media: radio, mediaSource: { kind: 'radio' }, mediaAt: Date.now() });
    return;
  }
  const { media, source } = pickMedia(s.systemMedia, s.webMusic);
  useApp.setState({ media, mediaSource: source, mediaAt: Date.now() });
  if (media?.playing) rememberTrack(media);
}

export function setSystemMedia(m: MediaInfo | null) {
  useApp.setState({ systemMedia: m });
  recompute();
}

export function startMusicSync() {
  // Radio changes (track, play state) recompute; position-only updates don't need to.
  let last = '';
  useRadio.subscribe((r) => {
    const key = `${r.index}|${r.playing}|${r.position === 0}`;
    if (key !== last) {
      last = key;
      recompute();
    } else if (useApp.getState().mediaSource.kind === 'radio' && r.playing && Math.abs((useApp.getState().media?.positionMs ?? 0) / 1000 - r.position) > 3) {
      recompute();
    }
  });
  return listen<MusicReport>('music://changed', (r) => {
    if (!r.service) {
      useApp.setState({ webMusic: {} }); // signed out of everything
    } else {
      useApp.setState((s) => ({ webMusic: { ...s.webMusic, [r.service]: r } }));
    }
    recompute();
  });
}

/** Play/pause/next/previous on whichever source the island is showing. */
export function mediaControl(action: 'toggle' | 'next' | 'previous') {
  const src = useApp.getState().mediaSource;
  if (src.kind === 'radio') return Promise.resolve(action === 'toggle' ? radioToggle() : action === 'next' ? radioNext() : radioPrev());
  if (src.kind === 'web') return call('music_control', { service: src.service, action });
  return call('media_control', { action });
}

/** Jumps to a position (ms) on whichever source the island is showing. */
export async function mediaSeek(ms: number) {
  const s = useApp.getState();
  const src = s.mediaSource;
  const at = Math.max(0, Math.round(ms));
  // Move the bar at once; the player catches up.
  if (s.media) useApp.setState({ media: { ...s.media, positionMs: at }, mediaAt: Date.now() });
  if (src.kind === 'radio') return radioSeek(at / 1000 / Math.max(1, (s.media?.durationMs ?? 1) / 1000));
  if (src.kind === 'web') return call('music_control', { service: src.service, action: `seek:${at}` });
  return call('media_seek', { ms: at });
}

/** Current position, moved forward since the last reading while playing. */
export function livePosition(m: MediaInfo | null, at: number, now = Date.now()): number | null {
  if (!m || m.positionMs == null) return null;
  const p = m.positionMs + (m.playing ? now - at : 0);
  return m.durationMs ? Math.min(m.durationMs, p) : p;
}
