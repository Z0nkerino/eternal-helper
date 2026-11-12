// One "now playing" for the island, from two sources: the system media session (any player app) and the
// web players of signed-in music accounts (Spotify, Yandex Music, SoundCloud). Whatever plays wins.
import { call, listen, type MediaInfo, type MusicReport } from './ipc';
import { useApp, type MediaSource } from './store';
import { rememberTrack } from './recent';

export const SERVICE_NAMES: Record<MusicReport['service'], string> = { spotify: 'Spotify', yandex: 'Yandex Music', soundcloud: 'SoundCloud' };

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

function recompute() {
  const s = useApp.getState();
  const { media, source } = pickMedia(s.systemMedia, s.webMusic);
  useApp.setState({ media, mediaSource: source, mediaAt: Date.now() });
  if (media?.playing) rememberTrack(media);
}

export function setSystemMedia(m: MediaInfo | null) {
  useApp.setState({ systemMedia: m });
  recompute();
}

export function startMusicSync() {
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
  if (src.kind === 'web') return call('music_control', { service: src.service, action });
  return call('media_control', { action });
}

/** Current position, moved forward since the last reading while playing. */
export function livePosition(m: MediaInfo | null, at: number, now = Date.now()): number | null {
  if (!m || m.positionMs == null) return null;
  const p = m.positionMs + (m.playing ? now - at : 0);
  return m.durationMs ? Math.min(m.durationMs, p) : p;
}
