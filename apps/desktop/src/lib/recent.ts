// "Recently played": the last tracks with covers, kept on this device.
import type { MediaInfo } from './ipc';

export interface RecentTrack {
  title: string;
  artist: string;
  artwork: string | null;
  source: string;
  at: number;
}

const KEY = 'eh.recent';

export function recentTracks(): RecentTrack[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentTrack[];
  } catch {
    return [];
  }
}

export function rememberTrack(m: MediaInfo) {
  const list = recentTracks();
  if (list[0]?.title === m.title && list[0]?.artist === m.artist) return;
  // data: covers can be large; keep only remote URLs to stay small.
  const artwork = m.artwork && !m.artwork.startsWith('data:') ? m.artwork : null;
  const next = [{ title: m.title, artist: m.artist, artwork, source: m.source, at: Date.now() }, ...list.filter((t) => !(t.title === m.title && t.artist === m.artist))].slice(0, 12);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}
