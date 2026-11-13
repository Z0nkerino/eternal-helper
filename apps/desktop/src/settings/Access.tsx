// Settings → Full access & motion: grant or take back full access, liquid glass and moving with music.
import { ShieldCheck, ShieldOff } from 'lucide-react';
import type { Settings } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { saveSettings, useApp } from '../lib/store';
import { revokeFullAccess } from '../lib/access';
import { Segment, Switch } from './parts';

export function AccessSection({ s }: { s: Settings }) {
  const tr = useTr();
  const granted = s.fullAccess?.granted;
  const perf = (s as unknown as { perf?: { enabled?: boolean; corner?: string } }).perf ?? {};
  return (
    <>
      <div className={`access-status ${granted ? 'on' : ''}`}>
        {granted ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
        <span className="grow">
          <b>{granted ? tr('Full access is on', 'Полный доступ включён') : tr('Full access is off', 'Полный доступ выключен')}</b>
          <span className="tiny faint">{granted ? `${tr('Since', 'С')} ${new Date(s.fullAccess.at).toLocaleDateString(tr.lang === 'ru' ? 'ru-RU' : 'en-US')} · ${tr('always on top, starts with the computer, Afina can open apps', 'всегда сверху, запуск с системой, Афина открывает приложения')}` : tr('The island hides for fullscreen apps and Afina can’t open apps.', 'Остров прячется в полноэкранных приложениях, Афина не открывает приложения.')}</span>
        </span>
        {granted ? (
          <button className="btn" onClick={() => void revokeFullAccess()}>{tr('Turn off', 'Выключить')}</button>
        ) : (
          <button className="btn accent" onClick={() => useApp.setState({ view: 'panel', sheet: 'access' })}>{tr('Allow…', 'Разрешить…')}</button>
        )}
      </div>
      <Switch label={tr('Liquid glass motion (follows the cursor, squishes, wobbles)', 'Жидкое стекло (следует за курсором, пружинит, колышется)')} on={s.liquid.enabled} onChange={(enabled) => void saveSettings({ liquid: { ...s.liquid, enabled } })} />
      <Switch label={tr('Move with the beat of the music', 'Двигаться в такт музыке')} on={s.liquid.beat} onChange={(beat) => void saveSettings({ liquid: { ...s.liquid, beat } })} />
      <Switch label={tr('Show the developer notice at start', 'Показывать новости от разработчика при запуске')} on={s.newsAtStart} onChange={(newsAtStart) => void saveSettings({ newsAtStart })} />
      <Switch label={tr('In-game overlay: FPS, CPU, GPU and memory in fullscreen apps', 'Оверлей в играх: FPS, CPU, GPU и память в полноэкранных приложениях')} on={perf.enabled !== false} onChange={(enabled) => void saveSettings({ perf: { ...perf, enabled } } as unknown as Partial<Settings>)} />
      <Segment
        label={tr('Overlay corner', 'Угол оверлея')}
        value={perf.corner ?? 'top-left'}
        options={[['top-left', tr('Top left', 'Слева вверху')], ['top-right', tr('Top right', 'Справа вверху')], ['bottom-left', tr('Bottom left', 'Слева внизу')], ['bottom-right', tr('Bottom right', 'Справа внизу')]]}
        onChange={(corner) => void saveSettings({ perf: { ...perf, corner } } as unknown as Partial<Settings>)}
      />
    </>
  );
}
