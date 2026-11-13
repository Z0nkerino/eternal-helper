// Home: your widgets on a small grid. "Edit" makes them wiggle: drag to reorder, × to remove, + to add
// from the gallery. The island grows and shrinks to fit the rows.
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, Check, Pencil, Plus, X } from 'lucide-react';
import { installUpdate } from '../lib/updates';
import { useRef, useState } from 'react';
import { useTr } from '../lib/i18n';
import { saveSettings, useApp } from '../lib/store';
import { cellsOf, cellsOfWidget, MAX_CELLS, widget, WIDGETS, DEFAULT_WIDGETS } from '../home/widgets';

export function useHomeWidgets(): string[] {
  const ids = useApp((s) => s.settings?.homeWidgets);
  return (ids ?? DEFAULT_WIDGETS).filter((id) => widget(id));
}

function Gallery({ ids, onAdd, onClose }: { ids: string[]; onAdd: (id: string) => void; onClose: () => void }) {
  const tr = useTr();
  const free = MAX_CELLS - cellsOf(ids);
  const left = WIDGETS.filter((w) => !ids.includes(w.id));
  return (
    <motion.div className="w-gallery" initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
      <header className="row between">
        <span className="w-gallery-title">{tr('Add a widget', 'Добавить виджет')}</span>
        <button className="icon-btn" onClick={onClose} aria-label={tr('Close', 'Закрыть')}><X size={16} /></button>
      </header>
      {left.length === 0 && <p className="small muted">{tr('All widgets are on Home already.', 'Все виджеты уже на Главной.')}</p>}
      <div className="w-gallery-grid">
        {left.map((w, i) => {
          const fits = cellsOfWidget(w) <= free;
          const Icon = w.icon;
          return (
            <motion.button key={w.id} className="w-pick" disabled={!fits} onClick={() => onAdd(w.id)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }} whileHover={fits ? { y: -2 } : undefined} whileTap={fits ? { scale: 0.95 } : undefined}>
              <span className="w-pick-icon"><Icon size={18} /></span>
              <span className="small">{tr(...w.name)}</span>
              <span className="tiny faint">{fits ? { s: tr('Small', 'Маленький'), m: tr('Medium', 'Средний'), w: tr('Wide', 'Широкий'), t: tr('Large', 'Большой') }[w.size] : tr('No room', 'Нет места')}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

function UpdatePill() {
  const tr = useTr();
  const u = useApp((s) => s.update);
  if (!u?.available) return null;
  return (
    <motion.button className="update-pill" onClick={() => u.progress == null && void installUpdate()} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
      <ArrowDownToLine size={13} />
      {u.progress != null ? `${tr('Downloading', 'Загрузка')} ${Math.round(u.progress * 100)}%` : `${tr('Update to', 'Обновить до')} ${u.latest}`}
      {u.progress != null && <i style={{ transform: `scaleX(${u.progress})` }} />}
    </motion.button>
  );
}

export function HomeTab() {
  const tr = useTr();
  const ids = useHomeWidgets();
  const [edit, setEdit] = useState(false);
  const [gallery, setGallery] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const save = (next: string[]) => void saveSettings({ homeWidgets: next });

  // Drop a dragged widget where the pointer is: before whichever widget it lands on.
  const drop = (id: string, x: number, y: number) => {
    const els = [...(grid.current?.querySelectorAll<HTMLElement>('[data-wid]') ?? [])];
    const target = els.find((el) => {
      if (el.dataset.wid === id) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    if (!target) return;
    const next = ids.filter((x) => x !== id);
    const at = next.indexOf(target.dataset.wid!);
    const from = ids.indexOf(id);
    next.splice(from <= ids.indexOf(target.dataset.wid!) ? at + 1 : at, 0, id);
    save(next);
  };

  return (
    <div className={`home2 ${edit ? 'editing' : ''}`}>
      <div className="w-grid" ref={grid}>
        <AnimatePresence initial={false}>
          {ids.map((id, i) => {
            const w = widget(id)!;
            return (
              <motion.div
                key={id}
                data-wid={id}
                layout
                className={`widget w-${w.size}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.18 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 34, delay: edit ? 0 : i * 0.035 }}
                drag={edit}
                dragSnapToOrigin
                dragElastic={0.15}
                whileDrag={{ scale: 1.06, zIndex: 5, boxShadow: '0 20px 40px -10px #000' }}
                onDragEnd={(_, info) => drop(id, info.point.x - scrollX, info.point.y - scrollY)}
                style={{ ['--jig' as string]: `${(i % 3) * -0.11}s` }}
              >
                <div className="widget-in">
                  <w.Body />
                </div>
                <AnimatePresence>
                  {edit && (
                    <motion.button className="w-remove" aria-label={tr('Remove', 'Убрать')} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 26 }} onClick={() => save(ids.filter((x) => x !== id))} onPointerDown={(e) => e.stopPropagation()}>
                      <X size={11} strokeWidth={3} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {ids.length === 0 && (
          <button className="w-empty-home" onClick={() => (setEdit(true), setGallery(true))}>
            <Plus size={18} /> {tr('Add widgets', 'Добавь виджеты')}
          </button>
        )}
      </div>
      <div className="home-bar">
        <UpdatePill />
        <AnimatePresence mode="popLayout" initial={false}>
          {edit ? (
            <motion.div key="e" className="row gap" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
              <button className="chip-btn" onClick={() => setGallery(true)}><Plus size={13} /> {tr('Add widget', 'Добавить')}</button>
              <button className="chip-btn" onClick={() => save(DEFAULT_WIDGETS)}>{tr('Reset', 'Сбросить')}</button>
              <button className="chip-btn accent" onClick={() => (setEdit(false), setGallery(false))}><Check size={13} /> {tr('Done', 'Готово')}</button>
            </motion.div>
          ) : (
            <motion.div key="n" className="row gap" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
              <button className="chip-btn" onClick={() => (setEdit(true), setGallery(true))}>
                <Plus size={12} /> {tr('Add widget', 'Добавить виджет')}
              </button>
              <button className="chip-btn" onClick={() => setEdit(true)}>
                <Pencil size={12} /> {tr('Edit', 'Изменить')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>{gallery && <Gallery ids={ids} onAdd={(id) => save([...ids, id])} onClose={() => setGallery(false)} />}</AnimatePresence>
    </div>
  );
}
