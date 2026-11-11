// Universal Planner connector: live events in via webhook, today's tasks from the Planner's backup folder.
import { Check, Copy, ExternalLink, FolderOpen, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { call, inTauri, type PlannerInfo } from '../lib/ipc';
import { useT } from '../lib/i18n';
import { saveSettings, toast, useApp } from '../lib/store';
import { refreshPlanner } from '../lib/planner';
import { copyText } from '../lib/clipboard';

const fmt = (ms: number, lang: string) => new Date(ms).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
const day = (ms: number, lang: string) => new Date(ms).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short', day: 'numeric' });

export function PlannerTab() {
  const t = useT();
  const snap = useApp((s) => s.planner);
  const err = useApp((s) => s.plannerError);
  const folder = useApp((s) => s.settings?.planner.backupDir ?? '');
  const [info, setInfo] = useState<PlannerInfo | null>(null);

  useEffect(() => {
    void call('planner_info').then(setInfo);
    void refreshPlanner();
  }, []);

  const pick = async () => {
    const dir = inTauri ? await open({ directory: true, title: t('planner.pick') }) : null;
    if (typeof dir === 'string') {
      await saveSettings({ planner: { ...useApp.getState().settings!.planner, backupDir: dir } });
      void refreshPlanner();
    }
  };

  return (
    <div className="planner scroll">
      <div className="planner-head">
        <img src="/up-mark.svg" width={22} height={22} alt="" />
        <div>
          <div className="title">{t('planner.title')}</div>
          <div className="faint small">Eternal Inc.</div>
        </div>
        <button className="btn" onClick={() => void call('planner_open')}>
          <ExternalLink size={14} /> {t('planner.open')}
        </button>
      </div>

      <section className="card">
        <div className="row between">
          <span className="section-title">{t('planner.today')}</span>
          {folder && (
            <button className="icon-btn" aria-label="Refresh" onClick={() => void refreshPlanner(true)}>
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        {snap ? (
          <>
            {snap.tasksToday.length ? (
              <ul className="tasks">
                {snap.tasksToday.slice(0, 8).map((x) => (
                  <li key={x.id}>
                    <span className={`dot p${x.priority}`} />
                    <span className="ellipsis">{x.title}</span>
                    {x.start && <span className="faint small mono">{fmt(x.start, t.lang)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('planner.allDone')}</p>
            )}
            <div className="faint small">
              <Check size={12} /> {snap.doneToday} {t('planner.done')} · {snap.file}
            </div>
            {snap.upcoming.length > 0 && (
              <>
                <div className="section-title" style={{ marginTop: 10 }}>{t('planner.upcoming')}</div>
                <ul className="tasks">
                  {snap.upcoming.slice(0, 4).map((e) => (
                    <li key={e.id}>
                      <span className="faint small mono">{day(e.start, t.lang)}{e.allDay ? '' : ` ${fmt(e.start, t.lang)}`}</span>
                      <span className="ellipsis">{e.title}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <>
            <p className="muted small">{err === 'no-backup' ? t('planner.noBackup') : t('planner.folderHelp')}</p>
            <button className="btn" onClick={() => void pick()}>
              <FolderOpen size={14} /> {t('planner.pick')}
            </button>
          </>
        )}
        {folder && snap && (
          <button className="link small" onClick={() => void pick()}>
            {folder}
          </button>
        )}
      </section>

      <section className="card">
        <div className="row between">
          <span className="section-title">{t('planner.live')}</span>
          <span className={`status ${info?.listening ? 'ok' : 'warn'}`}>{info?.listening ? t('planner.listening') : t('planner.notListening')}</span>
        </div>
        <p className="muted small">{t('planner.liveHelp')}</p>
        <div className="copy-row">
          <code className="ellipsis">{info?.webhookUrl ?? '…'}</code>
          <button
            className="btn"
            onClick={() => info && void copyText(info.webhookUrl).then(() => toast(t('copied'), { tone: 'ok', force: true }))}
          >
            <Copy size={14} /> {t('copy')}
          </button>
        </div>
        {info && info.recent.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 10 }}>{t('planner.recent')}</div>
            <ul className="tasks">
              {info.recent.slice(0, 4).map((e, i) => (
                <li key={i}>
                  <span className="ellipsis">{e.text}</span>
                  <span className="faint small mono">{e.at ? fmt(Date.parse(e.at), t.lang) : ''}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
