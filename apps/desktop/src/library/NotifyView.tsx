// Notifications from every app on the PC, newest first, grouped by app with its real logo. The first time,
// Windows asks the user to allow it (Settings → Privacy → Notifications).
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellOff, MessageCircle, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call, type NotifAccess } from '../lib/ipc';
import { useT } from '../lib/i18n';
import { openChat, useApp } from '../lib/store';
import { AppLogo, logoId } from '../lib/brands';

const CHAT_IDS = ['telegram', 'whatsapp', 'discord'];
export const ago = (at: number, ru: boolean) => {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return ru ? 'сейчас' : 'now';
  if (m < 60) return ru ? `${m} мин` : `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? (ru ? `${h} ч` : `${h}h`) : new Date(at).toLocaleDateString(ru ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' });
};

export function NotifyView() {
  const t = useT();
  const ru = t.lang === 'ru';
  const list = useApp((s) => s.notifications);
  const [access, setAccess] = useState<NotifAccess | null>(null);
  useEffect(() => void call('notif_status').then((a) => setAccess(a ?? 'unsupported')), []);
  const remove = (id: number) => useApp.setState((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));

  return (
    <div className="notify">
      {access && access !== 'allowed' && (
        <div className={`notify-access ${access}`}>
          <Bell size={16} />
          <span className="small grow">
            {access === 'unsupported'
              ? ru ? 'Чтение уведомлений других приложений работает на Windows 10/11.' : 'Reading other apps’ notifications works on Windows 10/11.'
              : access === 'denied'
                ? ru ? 'Доступ к уведомлениям выключен в Windows: Параметры → Конфиденциальность → Уведомления.' : 'Notification access is off in Windows: Settings → Privacy → Notifications.'
                : ru ? 'Разреши острову показывать уведомления всех приложений.' : 'Let the island show notifications from all your apps.'}
          </span>
          {access === 'ask' && <button className="btn accent" onClick={() => void call('notif_request').then((a) => setAccess(a ?? 'unsupported'))}>{ru ? 'Разрешить' : 'Allow'}</button>}
          {access === 'denied' && <button className="btn" onClick={() => void call('open_system_settings', { page: 'notifications' })}>{ru ? 'Открыть' : 'Open'}</button>}
        </div>
      )}
      <div className="notify-bar">
        <span className="small faint">{list.length ? (ru ? `${list.length} уведомл.` : `${list.length} notifications`) : ''}</span>
        <span className="grow" />
        {list.length > 0 && (
          <button className="chip-btn" onClick={() => useApp.setState({ notifications: [] })}>
            <Trash2 size={12} /> {ru ? 'Очистить' : 'Clear all'}
          </button>
        )}
      </div>
      <div className="notify-list scroll">
        {list.length === 0 && (
          <div className="notify-empty">
            <BellOff size={26} className="faint" />
            <p className="small faint">{ru ? 'Новых уведомлений нет' : 'No new notifications'}</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {list.map((n, i) => {
            const id = logoId(n.app);
            const chat = id && CHAT_IDS.includes(id) ? id : null;
            return (
              <motion.div key={n.id} layout className="notify-item" initial={{ opacity: 0, y: -14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 60, height: 0, marginBottom: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32, delay: Math.min(i, 8) * 0.02 }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5} onDragEnd={(_, info) => Math.abs(info.offset.x) > 90 && remove(n.id)}>
                <AppLogo name={n.app} size={28} fallback={<span className="notify-fallback"><Bell size={14} /></span>} />
                <div className="grow notify-text">
                  <div className="row gap-s">
                    <span className="tiny faint ellipsis">{n.app}</span>
                    <span className="grow" />
                    <span className="tiny faint">{ago(n.at || Date.now(), ru)}</span>
                  </div>
                  <span className="small ellipsis notify-title">{n.title}</span>
                  {n.body && <span className="tiny muted notify-body">{n.body}</span>}
                </div>
                {chat && (
                  <button className="icon-btn" title={ru ? 'Ответить' : 'Reply'} aria-label={ru ? 'Ответить' : 'Reply'} onClick={() => openChat(chat)}>
                    <MessageCircle size={14} />
                  </button>
                )}
                <button className="icon-btn" aria-label={ru ? 'Убрать' : 'Dismiss'} onClick={() => remove(n.id)}>
                  <X size={13} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
