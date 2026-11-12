// Colour 3D emoji (Microsoft Fluent Emoji, MIT) — the same on Windows and macOS.
// Emoji the app bundles render as images; anything else falls back to the system font.
import { Fragment, type ReactNode } from 'react';
import manifest from './emoji-manifest.json';

const files = manifest as Record<string, string>;
const strip = (e: string) => e.replace(/️/g, '');

export const hasEmoji = (e: string) => strip(e) in files;

export function Emoji({ e, size = 18, label, className = '' }: { e: string; size?: number; label?: string; className?: string }) {
  const file = files[strip(e)];
  if (!file) return <span className={`emoji-text ${className}`} style={{ fontSize: size * 0.9 }} role="img" aria-label={label ?? e}>{e}</span>;
  return <img className={`emoji ${className}`} src={`/emoji/${file}.webp`} width={size} height={size} alt={label ?? e} draggable={false} />;
}

const EMOJI_RE = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)/gu;

/** Text with every emoji drawn as a Fluent 3D emoji, sized to the text. */
export function Rich({ text, size = 16 }: { text: string; size?: number }): ReactNode {
  const parts = text.split(EMOJI_RE);
  return parts.map((p, i) => (i % 2 === 1 ? <Emoji key={i} e={p} size={size} className="inline" /> : <Fragment key={i}>{p}</Fragment>));
}
