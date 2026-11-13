// Real logos for the apps and services the island talks about (Spotify, Claude, Telegram…), drawn as small
// app-icon tiles: the brand's colour behind its white mark. Marks come from Simple Icons (CC0); the few it
// doesn't carry are simple stand-ins in the brand's colours.
import type { ReactNode } from 'react';
import {
  siApplemusic, siClaude, siDeepseek, siDiscord, siFigma, siFirefoxbrowser, siGithub, siGmail, siGooglechrome, siGooglegemini, siInstagram, siNetflix, siNotion,
  siObsidian, siOpera, siPerplexity, siReddit, siSignal, siSoundcloud, siSpotify, siSteam, siTelegram, siTiktok, siTwitch, siViber, siVk, siWhatsapp, siX,
  siYoutube, siYoutubemusic, siZoom, siBrave, siEpicgames, siDeezer,
} from 'simple-icons';

type Mark = { path: string; bg: string; fg?: string; grad?: [string, string] };
const si = (i: { path: string; hex: string }, fg?: string): Mark => ({ path: i.path, bg: `#${i.hex}`, fg });

// Stand-ins (24×24 paths).
const KNOT = 'M12 2.6a4.4 4.4 0 0 1 4.2 3.1 4.4 4.4 0 0 1 4.6 6.3 4.4 4.4 0 0 1-2.6 7.4A4.4 4.4 0 0 1 12 21.4a4.4 4.4 0 0 1-4.2-3.1A4.4 4.4 0 0 1 3.2 12a4.4 4.4 0 0 1 2.6-7.4A4.4 4.4 0 0 1 12 2.6zm0 2.2a2.2 2.2 0 0 0-2.2 2.2v5.6l4.8 2.8 1.1-1.9-3.7-2.1V7A2.2 2.2 0 0 0 12 4.8z';
const NOTE = 'M15.5 3.5v10.2a3.3 3.3 0 1 1-2-3V6.2l-5 1.4v8.1a3.3 3.3 0 1 1-2-3V6.1z';
const RIBBON = 'M8.4 3h7.8c1.5 0 2.6 1.3 2.3 2.8l-1.6 8.4c-.3 1.7-1.8 2.8-3.5 2.8H6.5L8 9.4C8.3 6 6.8 3 8.4 3zM15.6 21H7.8c-1.5 0-2.6-1.3-2.3-2.8l.9-4.6h6.4c1.4 0 2.7-.9 3.1-2.2l1.4-4.4c.6 1.3.9 2.7.6 4.2z';
const SWIRL = 'M12 2.5a9.5 9.5 0 0 1 9.4 8.2c.3 2.8-1.9 4.8-4.6 4.8-2.2 0-3.3-1.2-3.3-2.6 0-.9.6-1.4.6-2.6 0-2-2-3.5-4.6-3.5-3.4 0-6.2 3-6.2 6.6 0 .9.2 1.8.5 2.6A9.5 9.5 0 0 1 12 2.5zm-1.8 10.2c0 3.5 3 6.6 7.3 6.6.8 0 1.6-.1 2.2-.3A9.5 9.5 0 0 1 4.1 17c1.6-2.8 3.7-4.4 6.1-4.3z';
const BRACKETS = 'M17.3 2.4 21 4.2v15.6l-3.7 1.8-9.5-8.7-4.1 3.1L2 15V9l1.7-1 4.1 3.1zm0 5L11.6 12l5.7 4.6z';
const HASH = 'M9 3h2.2l-.7 4.5h4L15.2 3h2.2l-.7 4.5H21v2.2h-4.6l-.6 4.6H20v2.2h-4.5L14.8 21h-2.2l.7-4.5h-4L8.6 21H6.4l.7-4.5H3v-2.2h4.4l.7-4.6H4V7.5h4.4zm1.2 6.7-.7 4.6h4l.7-4.6z';
const T = 'M4 5h11v3.2h-3.9V19H7.9V8.2H4zm12.5 3a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm-1 1.5H21v6.5a3 3 0 0 1-3 3h-.7a4.6 4.6 0 0 0 .2-1.4z';
const ENVELOPE = 'M3 6h18v12H3zm2 2v.4l7 4.4 7-4.4V8l-7 4.3z';

const MARKS: Record<string, Mark> = {
  spotify: si(siSpotify, '#000'),
  claude: si(siClaude),
  perplexity: si(siPerplexity),
  gemini: { path: siGooglegemini.path, bg: '#1b1d27', grad: ['#4f8cff', '#c17cf0'] },
  deepseek: si(siDeepseek),
  chatgpt: { path: KNOT, bg: '#10a37f' },
  copilot: { path: RIBBON, bg: '#111', grad: ['#2fb4ff', '#c45cf2'] },
  yandex: { path: NOTE, bg: '#111', grad: ['#ffcc00', '#ff3a1f'] },
  soundcloud: si(siSoundcloud),
  youtube: si(siYoutubemusic),
  youtubevideo: si(siYoutube),
  applemusic: si(siApplemusic),
  deezer: si(siDeezer),
  telegram: si(siTelegram),
  whatsapp: si(siWhatsapp),
  discord: si(siDiscord),
  signal: si(siSignal),
  viber: si(siViber),
  vk: si(siVk),
  chrome: { path: siGooglechrome.path, bg: '#fff', fg: '#1a73e8' },
  edge: { path: SWIRL, bg: '#0c59a4', grad: ['#35c1f1', '#2ed573'] },
  firefox: si(siFirefoxbrowser),
  opera: si(siOpera),
  brave: si(siBrave),
  steam: si(siSteam),
  epic: si(siEpicgames),
  twitch: si(siTwitch),
  code: { path: BRACKETS, bg: '#0078d4' },
  slack: { path: HASH, bg: '#4a154b', grad: ['#36c5f0', '#ecb22e'] },
  teams: { path: T, bg: '#5b5fc7' },
  outlook: { path: ENVELOPE, bg: '#0a64ad' },
  gmail: si(siGmail, '#fff'),
  zoom: si(siZoom),
  notion: { path: siNotion.path, bg: '#fff', fg: '#000' },
  figma: si(siFigma, '#fff'),
  obsidian: si(siObsidian),
  github: { path: siGithub.path, bg: '#24292f' },
  netflix: { path: siNetflix.path, bg: '#000', fg: '#e50914' },
  tiktok: { path: siTiktok.path, bg: '#000' },
  instagram: { path: siInstagram.path, bg: '#d6249f', grad: ['#fdf497', '#d6249f'] },
  x: { path: siX.path, bg: '#000' },
  reddit: si(siReddit),
};

/** "Telegram Desktop", "Spotify.exe", "Яндекс Музыка", "msedge" → a logo id. */
export function logoId(name: string): string | null {
  const n = name.toLowerCase().replace(/\.exe$/, '');
  if (MARKS[n]) return n;
  const rules: [RegExp, string][] = [
    [/spotify/, 'spotify'], [/claude|anthropic/, 'claude'], [/chatgpt|openai/, 'chatgpt'], [/perplexity/, 'perplexity'], [/gemini|bard/, 'gemini'], [/deepseek/, 'deepseek'], [/copilot/, 'copilot'],
    [/yandex ?music|яндекс ?музык|yandexmusic/, 'yandex'], [/soundcloud/, 'soundcloud'], [/youtube ?music/, 'youtube'], [/youtube/, 'youtubevideo'], [/apple ?music|itunes|^music$/, 'applemusic'], [/deezer/, 'deezer'],
    [/telegram/, 'telegram'], [/whatsapp/, 'whatsapp'], [/discord/, 'discord'], [/signal/, 'signal'], [/viber/, 'viber'], [/^vk|вконтакте/, 'vk'],
    [/chrome/, 'chrome'], [/msedge|^edge|microsoft edge/, 'edge'], [/firefox/, 'firefox'], [/opera/, 'opera'], [/brave/, 'brave'],
    [/steam/, 'steam'], [/epic/, 'epic'], [/twitch/, 'twitch'], [/^code$|visual studio code|vscode/, 'code'], [/slack/, 'slack'], [/teams/, 'teams'], [/outlook/, 'outlook'], [/gmail/, 'gmail'],
    [/zoom/, 'zoom'], [/notion/, 'notion'], [/figma/, 'figma'], [/obsidian/, 'obsidian'], [/github/, 'github'], [/netflix/, 'netflix'], [/tiktok/, 'tiktok'], [/instagram/, 'instagram'], [/reddit/, 'reddit'],
  ];
  return rules.find(([r]) => r.test(n))?.[1] ?? null;
}

/** A brand tile for a service id (spotify, claude, telegram…) or any app name. */
export function AppLogo({ name, size = 20, fallback = null, plain = false }: { name: string; size?: number; fallback?: ReactNode; plain?: boolean }) {
  const id = logoId(name);
  const m = id ? MARKS[id] : null;
  if (!m) return <>{fallback}</>;
  const gid = `lg-${id}`;
  if (id === 'chatgpt') {
    // The blossom: three interlocking rounded links, drawn as strokes.
    return (
      <svg className={`app-logo ${plain ? 'plain' : ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        {!plain && <rect width="24" height="24" rx="6.5" fill={m.bg} />}
        <g fill="none" stroke={plain ? m.bg : '#fff'} strokeWidth="1.55" strokeLinecap="round" transform="translate(12 12)">
          {[0, 60, 120].map((a) => (
            <rect key={a} x="-2.7" y="-6.6" width="5.4" height="13.2" rx="2.7" transform={`rotate(${a})`} />
          ))}
        </g>
      </svg>
    );
  }
  const fill = m.grad ? `url(#${gid})` : plain ? m.bg : m.fg ?? '#fff';
  return (
    <svg className={`app-logo ${plain ? 'plain' : ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {m.grad && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={m.grad[0]} />
            <stop offset="1" stopColor={m.grad[1]} />
          </linearGradient>
        </defs>
      )}
      {!plain && <rect width="24" height="24" rx="6.5" fill={m.bg} />}
      <g transform={plain ? undefined : 'translate(4.6 4.6) scale(0.616)'}>
        <path d={m.path} fill={fill} />
      </g>
    </svg>
  );
}

/** The brand colour for a service (for glows and accents). */
export function brandColor(name: string): string | null {
  const id = logoId(name);
  const m = id ? MARKS[id] : null;
  return m ? m.grad?.[0] ?? (m.bg === '#fff' || m.bg === '#000' || m.bg === '#111' ? m.fg ?? null : m.bg) : null;
}
