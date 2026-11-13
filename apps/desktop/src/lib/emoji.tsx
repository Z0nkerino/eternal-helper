// Symbols across the app. Most emoji are drawn as clean line icons (lucide), tinted by meaning, so the
// UI looks calm and consistent. The few emoji without an icon fall back to colour 3D emoji (Microsoft
// Fluent Emoji, MIT) — the same on Windows and macOS — or the system font.
import { Fragment, type ReactNode } from 'react';
import {
  AlertTriangle, Battery, ClipboardList, Bell, BellOff, Bluetooth, Bot, Calculator, Calendar, CalendarDays, Camera, Candy, Cat, CheckCircle2, Clapperboard, Clock, Cloud, CloudFog,
  CloudLightning, CloudRain, CloudSnow, CloudSun, Coins, Compass, Cookie, Download, Droplet, Eye, Fish, Flame, Folder, Frown, Gauge, Gift, Globe, Hand, Headphones, Heart,
  House, IceCreamCone, Image, Info, Keyboard, Languages, Lightbulb, Lock, Mail, MapPin, Mic, Monitor, Moon, MoonStar, Music, Music2, Palette, PartyPopper, Rabbit,
  Radio, Rainbow, RefreshCw, Rocket, Search, Settings, Smile, Snowflake, Sparkles, Star, Sun, Sunrise, Sunset, Thermometer, Timer, Trophy, Type, Umbrella, User,
  Utensils, Video, Volleyball, Volume2, Wifi, Wind, Wrench, XCircle, Zap, type LucideIcon,
} from 'lucide-react';
import manifest from './emoji-manifest.json';

const files = manifest as Record<string, string>;
const strip = (e: string) => e.replace(/️/g, '');

const SUN = '#ffc94d', MOON = '#b8c2ff', CLOUD = '#d3dcea', RAIN = '#7fb2ff', SNOW = '#bfe3ff', LOVE = '#ff6b8f', MAGIC = '#c39bff', GOOD = '#4cd97b', WARN = '#ffcf4d', BAD = '#ff5b52';
/** emoji → [icon, tint]. No tint = the text colour. */
const ICONS: Record<string, [LucideIcon, string?]> = {
  '🔮': [Sparkles, MAGIC], '✨': [Sparkles, MAGIC], '💫': [Sparkles, MAGIC], '🌟': [Star, SUN], '⭐': [Star, SUN],
  '💤': [Moon, MOON], '😴': [Moon, MOON], '🥱': [Moon, MOON], '🌙': [MoonStar, MOON], '🌓': [Moon], '🌛': [Moon, MOON],
  '🎵': [Music2], '🎶': [Music], '🎧': [Headphones], '📻': [Radio], '🎤': [Mic], '🔊': [Volume2],
  '🎬': [Clapperboard], '🎥': [Video], '📷': [Camera], '📸': [Camera], '🖼': [Image],
  '🧮': [Calculator], '🗓': [CalendarDays], '📅': [Calendar], '📆': [Calendar], '🔤': [Type], '🌐': [Globe], '🈯': [Languages], '💱': [Coins], '💰': [Coins],
  '☀': [Sun, SUN], '🌞': [Sun, SUN], '🌤': [CloudSun, SUN], '⛅': [CloudSun, SUN], '🌥': [CloudSun, CLOUD], '☁': [Cloud, CLOUD], '🌦': [CloudRain, RAIN], '🌧': [CloudRain, RAIN],
  '⛈': [CloudLightning, WARN], '🌩': [CloudLightning, WARN], '🌨': [CloudSnow, SNOW], '❄': [Snowflake, SNOW], '☃': [Snowflake, SNOW], '🌫': [CloudFog, CLOUD], '💨': [Wind], '🌬': [Wind],
  '🌈': [Rainbow, MAGIC], '☂': [Umbrella, RAIN], '☔': [Umbrella, RAIN], '💧': [Droplet, RAIN], '🌡': [Thermometer], '🧭': [Compass], '🌅': [Sunrise, SUN], '🌇': [Sunset, '#ff9f5a'], '🌄': [Sunrise, SUN],
  '⚙': [Settings], '🛠': [Wrench], '🔧': [Wrench], '🔄': [RefreshCw], '🔐': [Lock], '🔒': [Lock], '🔋': [Battery, GOOD], '⚡': [Zap, WARN], '📶': [Wifi], '🔵': [Bluetooth, '#5aa0ff'],
  '🔕': [BellOff], '🔔': [Bell, WARN], '⏱': [Timer], '⏰': [Clock], '🕐': [Clock], '🏠': [House], '📁': [Folder], '📂': [Folder], '🖥': [Monitor], '💻': [Monitor], '⌨': [Keyboard],
  '🔍': [Search], '🔎': [Search], '💡': [Lightbulb, WARN], '📍': [MapPin, BAD], '✉': [Mail], '📧': [Mail], '👤': [User], '🤖': [Bot], '📋': [ClipboardList], '🚀': [Rocket], '🎁': [Gift, LOVE], '🏆': [Trophy, SUN],
  '🎉': [PartyPopper, MAGIC], '🎊': [PartyPopper, MAGIC], '🔥': [Flame, '#ff8a3d'], '👀': [Eye], '👋': [Hand], '🎨': [Palette], '🆕': [Sparkles, MAGIC], 'ℹ': [Info], '⬇': [Download],
  '✅': [CheckCircle2, GOOD], '⚠': [AlertTriangle, WARN], '❌': [XCircle, BAD], '⛔': [XCircle, BAD], '🎾': [Volleyball, '#d6ef5a'], '🍽': [Utensils], '🍪': [Cookie, '#e0a96d'], '🍬': [Candy, LOVE],
  '🍦': [IceCreamCone, '#ffd1e0'], '💙': [Heart, '#5aa0ff'], '💗': [Heart, LOVE], '💖': [Heart, LOVE], '❤': [Heart, LOVE], '💞': [Heart, LOVE], '🫶': [Heart, LOVE], '🥰': [Heart, LOVE],
  '😊': [Smile], '🙂': [Smile], '😄': [Smile], '🥺': [Frown], '😢': [Frown], '🐰': [Rabbit], '🐱': [Cat], '🐟': [Fish], '🐠': [Fish], '🌊': [Wind, RAIN], '📊': [Gauge],
};

export const hasEmoji = (e: string) => strip(e) in files || strip(e) in ICONS;

export function Emoji({ e, size = 18, label, className = '' }: { e: string; size?: number; label?: string; className?: string }) {
  const key = strip(e);
  const icon = ICONS[key];
  if (icon) {
    const [Icon, tint] = icon;
    return (
      <span className={`eicon ${className}`} role="img" aria-label={label ?? e} style={{ width: size, height: size, color: tint }}>
        <Icon size={Math.round(size * 0.92)} strokeWidth={size >= 30 ? 1.6 : 2} />
      </span>
    );
  }
  const file = files[key];
  if (!file) return <span className={`emoji-text ${className}`} style={{ fontSize: size * 0.9 }} role="img" aria-label={label ?? e}>{e}</span>;
  return <img className={`emoji ${className}`} src={`/emoji/${file}.webp`} width={size} height={size} alt={label ?? e} draggable={false} />;
}

const EMOJI_RE = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)/gu;

/** Text with its emoji drawn as icons (or 3D emoji), sized to the text. */
export function Rich({ text, size = 16 }: { text: string; size?: number }): ReactNode {
  const parts = text.split(EMOJI_RE);
  return parts.map((p, i) => (i % 2 === 1 ? <Emoji key={i} e={p} size={size} className="inline" /> : <Fragment key={i}>{p}</Fragment>));
}
