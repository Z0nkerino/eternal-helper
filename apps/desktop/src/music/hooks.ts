// Shared music hooks: the cover's colour for tinting, and synced lyrics for the current track.
import { useEffect, useState } from 'react';
import { coverColor } from '../lib/color';
import { fetchLyrics, type LyricLine } from '../lib/lyrics';

/** Sets --cover on the page to the artwork's main colour while mounted. */
export function useCoverTint(art: string | null | undefined) {
  useEffect(() => {
    let alive = true;
    const root = document.documentElement;
    if (!art) return void root.style.removeProperty('--cover');
    void coverColor(art).then((c) => alive && (c ? root.style.setProperty('--cover', c) : root.style.removeProperty('--cover')));
    return () => {
      alive = false;
      root.style.removeProperty('--cover');
    };
  }, [art]);
}

/** The artwork's main colour (null until known). */
export function useCoverColor(art: string | null | undefined) {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!art) return void setColor(null);
    void coverColor(art).then((c) => alive && setColor(c));
    return () => void (alive = false);
  }, [art]);
  return color;
}

export function useLyrics(title?: string, artist?: string, duration?: number | null, skip = false) {
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  useEffect(() => {
    setLines(null);
    if (!title || skip) return;
    let alive = true;
    const id = setTimeout(() => void fetchLyrics(title, artist ?? '', duration).then((l) => alive && setLines(l)), 400);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [title, artist, duration, skip]);
  return lines;
}
