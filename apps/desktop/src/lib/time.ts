// Clock formatting that follows the user's choice (24/12-hour, seconds).
import { useApp } from './store';
import { resolveLang } from './i18n';

export function fmtTime(t: number | Date) {
  const s = useApp.getState().settings;
  const lang = resolveLang(s?.language);
  return new Date(t).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: s?.clockSeconds ? '2-digit' : undefined,
    hour12: s ? !s.clock24 : undefined,
  });
}
