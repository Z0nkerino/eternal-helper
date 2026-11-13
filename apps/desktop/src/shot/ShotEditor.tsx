// Screenshot editor: a full-screen layer over a frozen picture of the screen. Drag to select an area
// (or press F / Space for the whole screen), then draw on it. "Done" saves it to Pictures/Eternal Helper
// and copies it. Saved screenshots open here again to edit them fully (draw, crop, save over or as a
// copy). Everything is exported at the picture's real resolution.
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Check, Circle, Copy, Crop, Download, Grid3x3, Hash, Highlighter, Minus, Pencil, Redo2, Square, Type, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { call, emitEvent, inTauri } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { drawShape, type Shape, type Tool } from './shapes';

const COLORS = ['#FF3B30', '#FF9F0A', '#FFD60A', '#32D74B', '#0A84FF', '#BF5AF2', '#FFFFFF', '#111111'];
const SIZES = [3, 5, 9];
type Rect = { x: number; y: number; w: number; h: number };
const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

async function loadScreenshot(): Promise<HTMLImageElement> {
  let src: string;
  if (inTauri) {
    const bytes = await invoke<ArrayBuffer>('shot_image');
    src = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  } else {
    // Browser preview: a colourful fake desktop.
    const c = document.createElement('canvas');
    c.width = innerWidth * 2;
    c.height = innerHeight * 2;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, c.width, c.height);
    grd.addColorStop(0, '#5b7fa6');
    grd.addColorStop(1, '#c9a7d8');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffffffdd';
    g.fillRect(200, 200, 900, 560);
    g.fillStyle = '#222';
    g.font = '64px system-ui';
    g.fillText('Eternal Helper — Beta 0.1.1 Sunrise', 260, 330);
    g.font = '40px system-ui';
    g.fillText('Select an area, then draw on it ✏️', 260, 420);
    src = c.toDataURL();
  }
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Where the picture is drawn on screen (CSS px): the whole screen for a capture, fitted for a saved one. */
function fitView(img: HTMLImageElement | null, editing: boolean): Rect {
  if (!img || !editing) return { x: 0, y: 0, w: innerWidth, h: innerHeight };
  const k = Math.min((innerWidth - 120) / img.naturalWidth, (innerHeight - 170) / img.naturalHeight, 1 / (devicePixelRatio || 1));
  const w = Math.round(img.naturalWidth * k);
  const h = Math.round(img.naturalHeight * k);
  return { x: Math.round((innerWidth - w) / 2), y: Math.round((innerHeight - h) / 2) - 20, w, h };
}

export function ShotEditor() {
  const tr = useTr();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Rect | null>(null);
  const [phase, setPhase] = useState<'select' | 'edit'>('select');
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [redo, setRedo] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [text, setText] = useState<{ x: number; y: number; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cropStart = useRef<{ x: number; y: number } | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const path = inTauri ? await call('shot_info') : new URLSearchParams(location.search).get('edit');
        const im = await loadScreenshot();
        setEditing(path ?? null);
        setImg(im);
        // A saved screenshot opens ready to draw on, whole picture selected.
        if (path) {
          setSel(fitView(im, true));
          setPhase('edit');
        }
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);
  const view = fitView(img, !!editing);
  /** Picture pixels per CSS pixel. */
  const scale = img ? img.naturalWidth / view.w : 1;
  const offset = (r: Rect): Rect => ({ x: r.x - view.x, y: r.y - view.y, w: r.w, h: r.h });

  const close = useCallback(() => {
    if (inTauri) void call('shot_close');
    else location.hash = '';
  }, []);

  // Redraw annotations whenever they change.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !sel) return;
    const dpr = devicePixelRatio || 1;
    c.width = Math.round(sel.w * dpr);
    c.height = Math.round(sel.h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, sel.w, sel.h);
    const source = img ? { img, scale, offset: offset(sel) } : undefined;
    for (const s of [...shapes, ...(draft ? [draft] : [])]) drawShape(g, s, 1, source);
  }, [shapes, draft, sel, img, scale]);

  /** Renders the selection with its drawings at full resolution as PNG bytes. */
  const exportPng = useCallback(async (): Promise<Uint8Array | null> => {
    if (!img || !sel) return null;
    const o = offset(sel);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sel.w * scale));
    out.height = Math.max(1, Math.round(sel.h * scale));
    const g = out.getContext('2d')!;
    g.drawImage(img, o.x * scale, o.y * scale, sel.w * scale, sel.h * scale, 0, 0, out.width, out.height);
    for (const s of shapes) drawShape(g, s, scale, { img, scale, offset: o });
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  }, [img, sel, shapes, scale, view.x, view.y]);

  /**
   * Saves the picture: as a new file, or over the screenshot being edited (`replace`), optionally copying
   * it too. Errors stay in the editor (nothing is lost) instead of closing it.
   */
  const finish = useCallback(
    async (opts: { replace?: boolean; copy?: boolean }) => {
      setBusy(true);
      setNotice(null);
      try {
        const png = await exportPng();
        if (!png) throw new Error(tr('Nothing to save', 'Нечего сохранять'));
        if (!inTauri) return close();
        const headers: Record<string, string> = {};
        if (opts.copy) headers['x-copy'] = '1';
        if (opts.replace && editing) headers['x-replace'] = encodeURIComponent(editing);
        const path = await invoke<string>('shot_save', png, { headers });
        void emitEvent('island://shot-saved', path);
        if (opts.copy) void emitEvent('island://toast', tr('Screenshot saved and copied', 'Скриншот сохранён и скопирован'));
        close();
      } catch (e) {
        setNotice(`${tr('Couldn’t save', 'Не удалось сохранить')}: ${String((e as Error)?.message ?? e)}`);
        setBusy(false);
      }
    },
    [exportPng, close, tr, editing],
  );
  const copy = useCallback(() => finish({ copy: true, replace: !!editing }), [finish, editing]);
  const save = useCallback(() => finish({ replace: !!editing }), [finish, editing]);
  const saveCopy = useCallback(() => finish({}), [finish]);

  // Keyboard: Esc closes, Enter/⌘C copies, ⌘S saves, ⌘Z undo, F = whole screen, tool letters.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (text) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') return close();
      if (phase === 'select' && (e.key === 'f' || e.key === ' ')) {
        setSel(view);
        setPhase('edit');
        return;
      }
      if (phase !== 'edit') return;
      if (e.key === 'Enter' || (mod && e.key.toLowerCase() === 'c')) return void copy();
      if (mod && e.key.toLowerCase() === 's') return e.preventDefault(), void save();
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) return redoLast();
        return undo();
      }
      const keys: Record<string, Tool | 'crop'> = { p: 'pen', m: 'marker', a: 'arrow', l: 'line', r: 'rect', o: 'ellipse', t: 'text', n: 'number', b: 'blur', c: 'crop' };
      if (keys[e.key] && !mod) setTool(keys[e.key] as Tool);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const undo = () => setShapes((s) => (s.length ? (setRedo((r) => [s[s.length - 1], ...r]), s.slice(0, -1)) : s));
  const redoLast = () => setRedo((r) => (r.length ? (setShapes((s) => [...s, r[0]]), r.slice(1)) : r));

  // ----- pointer -----
  const local = (e: React.PointerEvent) => (sel ? { x: e.clientX - sel.x, y: e.clientY - sel.y } : { x: e.clientX, y: e.clientY });

  const onDown = (e: React.PointerEvent) => {
    if (phase === 'select') {
      start.current = { x: e.clientX, y: e.clientY };
      setSel({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
      return;
    }
    if (!sel) return;
    const p = local(e);
    if (p.x < 0 || p.y < 0 || p.x > sel.w || p.y > sel.h) return;
    if (tool === 'text') {
      // Keep the browser from moving focus on this click, or the new text box would blur at once.
      e.preventDefault();
      if (text) return commitText();
      return setText({ x: p.x, y: p.y, value: '' });
    }
    if (tool === 'number') {
      const n = shapes.filter((s) => s.tool === 'number').length + 1;
      setShapes((s) => [...s, { tool, color, size, points: [p], label: String(n) }]);
      setRedo([]);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if ((tool as string) === 'crop') {
      cropStart.current = { x: e.clientX, y: e.clientY };
      setCrop({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
      return;
    }
    setDraft({ tool, color, size, points: [p, p] });
  };

  const onMove = (e: React.PointerEvent) => {
    if (phase === 'select' && start.current) return setSel(norm(start.current, { x: e.clientX, y: e.clientY }));
    if (cropStart.current && sel) {
      const c = norm(cropStart.current, { x: Math.max(sel.x, Math.min(sel.x + sel.w, e.clientX)), y: Math.max(sel.y, Math.min(sel.y + sel.h, e.clientY)) });
      return setCrop(c);
    }
    if (!draft) return;
    const p = local(e);
    setDraft((d) => (d ? (d.tool === 'pen' || d.tool === 'marker' ? { ...d, points: [...d.points, p] } : { ...d, points: [d.points[0], p] }) : d));
  };

  const onUp = () => {
    if (phase === 'select' && start.current) {
      start.current = null;
      // A click without dragging takes the whole screen.
      setSel((s) => (!s || s.w < 6 || s.h < 6 ? view : s));
      setPhase('edit');
      return;
    }
    if (cropStart.current) {
      cropStart.current = null;
      // The new frame keeps the drawings in place on the picture.
      if (crop && sel && crop.w > 8 && crop.h > 8) {
        const dx = sel.x - crop.x;
        const dy = sel.y - crop.y;
        setShapes((list) => list.map((sh) => ({ ...sh, points: sh.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) })));
        setSel(crop);
        setTool('arrow');
      }
      setCrop(null);
      return;
    }
    if (draft) {
      const [a, b] = [draft.points[0], draft.points[draft.points.length - 1]];
      if (draft.points.length > 2 || Math.hypot(b.x - a.x, b.y - a.y) > 3) {
        setShapes((s) => [...s, draft]);
        setRedo([]);
      }
      setDraft(null);
    }
  };

  const commitText = () => {
    if (text && text.value.trim()) {
      setShapes((s) => [...s, { tool: 'text', color, size, points: [{ x: text.x, y: text.y }], label: text.value.trim() }]);
      setRedo([]);
    }
    setText(null);
  };

  const tools: [Tool, typeof Pencil, string, string][] = [
    ['pen', Pencil, 'Pen', 'Карандаш'],
    ['marker', Highlighter, 'Marker', 'Маркер'],
    ['arrow', ArrowUpRight, 'Arrow', 'Стрелка'],
    ['line', Minus, 'Line', 'Линия'],
    ['rect', Square, 'Rectangle', 'Прямоугольник'],
    ['ellipse', Circle, 'Ellipse', 'Овал'],
    ['text', Type, 'Text', 'Текст'],
    ['number', Hash, 'Step number', 'Номер шага'],
    ['blur', Grid3x3, 'Blur', 'Размытие'],
    ['crop' as Tool, Crop, 'Crop', 'Обрезать'],
  ];

  if (error) {
    return (
      <div className="shot-error">
        <p>{error}</p>
        <button className="btn" onClick={close}>{tr('Close', 'Закрыть')}</button>
      </div>
    );
  }

  const toolbarBelow = sel ? sel.y + sel.h + 64 < innerHeight : true;
  return (
    <div className={`shot phase-${phase} tool-${tool} ${editing ? "editing" : ""}`} data-shapes={shapes.length} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      {img && <img className="shot-img" src={img.src} alt="" draggable={false} style={editing ? { left: view.x, top: view.y, width: view.w, height: view.h } : undefined} />}
      {crop && <div className="shot-crop" style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }} />}
      <AnimatePresence>
        {notice && (
          <motion.div className="shot-notice" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onPointerDown={(e) => e.stopPropagation()}>
            {notice}
            <button className="icon-btn" onClick={() => setNotice(null)} aria-label="OK"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Dim everything outside the selection */}
      <svg className="shot-dim" width="100%" height="100%" aria-hidden>
        <defs>
          <mask id="hole">
            <rect width="100%" height="100%" fill="#fff" />
            {sel && <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} fill="#000" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#hole)" />
      </svg>
      {phase === 'select' && !sel && (
        <motion.div className="shot-hint" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          {tr('Drag to select an area · Click or press F for the whole screen · Esc to cancel', 'Выдели область мышью · Клик или F — весь экран · Esc — отмена')}
        </motion.div>
      )}
      {sel && (
        <div className="shot-sel" style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}>
          <canvas ref={canvas} style={{ width: sel.w, height: sel.h }} />
          <span className="shot-size mono">
            {Math.round(sel.w * scale)} × {Math.round(sel.h * scale)}
          </span>
          {text && (
            <input
              className="shot-text"
              ref={(el) => el && requestAnimationFrame(() => el.focus())}
              style={{ left: text.x, top: text.y - 14, color, fontSize: 14 + size * 2 }}
              value={text.value}
              onChange={(e) => setText({ ...text, value: e.target.value })}
              onKeyDown={(e) => (e.key === 'Enter' ? commitText() : e.key === 'Escape' ? setText(null) : undefined)}
              onBlur={commitText}
              onPointerDown={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
      <AnimatePresence>
        {phase === 'edit' && sel && (
          <motion.div
            className="shot-bar"
            style={{ left: Math.max(8, Math.min(innerWidth - 680, sel.x + sel.w / 2 - 336)), top: toolbarBelow ? sel.y + sel.h + 12 : Math.max(8, sel.y - 58) }}
            initial={{ opacity: 0, y: toolbarBelow ? -8 : 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {tools.map(([id, Icon, en, ru]) => (
              <button key={id} className={`shot-btn ${tool === id ? 'on' : ''}`} title={tr(en, ru)} aria-label={tr(en, ru)} onClick={() => setTool(id)}>
                <Icon size={16} />
              </button>
            ))}
            <span className="shot-sep" />
            {COLORS.map((c) => (
              <button key={c} className={`shot-color ${color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setColor(c)} />
            ))}
            <span className="shot-sep" />
            {SIZES.map((s) => (
              <button key={s} className={`shot-btn ${size === s ? 'on' : ''}`} aria-label={`${s}px`} onClick={() => setSize(s)}>
                <span className="shot-dot" style={{ width: s + 2, height: s + 2 }} />
              </button>
            ))}
            <span className="shot-sep" />
            <button className="shot-btn" title={tr('Undo', 'Отменить')} aria-label={tr('Undo', 'Отменить')} disabled={!shapes.length} onClick={undo}>
              <Undo2 size={16} />
            </button>
            <button className="shot-btn" title={tr('Redo', 'Повторить')} aria-label={tr('Redo', 'Повторить')} disabled={!redo.length} onClick={redoLast}>
              <Redo2 size={16} />
            </button>
            <span className="shot-sep" />
            {editing ? (
              <button className="shot-btn" title={tr('Save as a copy', 'Сохранить копию')} aria-label={tr('Save as a copy', 'Сохранить копию')} disabled={busy} onClick={() => void saveCopy()}>
                <Copy size={16} />
              </button>
            ) : (
              <button className="shot-btn" title={tr('Save without copying (Ctrl+S)', 'Сохранить без копирования (Ctrl+S)')} aria-label={tr('Save', 'Сохранить')} disabled={busy} onClick={() => void save()}>
                <Download size={16} />
              </button>
            )}
            <button className="shot-btn close" title={tr('Cancel (Esc)', 'Отмена (Esc)')} aria-label={tr('Cancel', 'Отмена')} onClick={close}>
              <X size={16} />
            </button>
            <button className="shot-done" disabled={busy} onClick={() => void (editing ? save() : copy())} title={editing ? tr('Save changes', 'Сохранить изменения') : tr('Save to Pictures and copy (Enter)', 'Сохранить в Изображения и скопировать (Enter)')}>
              <Check size={15} /> {editing ? tr('Save', 'Сохранить') : tr('Done', 'Готово')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
