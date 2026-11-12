// Drawing annotations on a canvas. Shapes are stored in selection-relative CSS pixels; `scale` maps
// them to the export resolution.
export type Tool = 'pen' | 'marker' | 'arrow' | 'line' | 'rect' | 'ellipse' | 'text' | 'number' | 'blur';

export interface Shape {
  tool: Tool;
  color: string;
  size: number;
  points: { x: number; y: number }[];
  label?: string;
}

export interface Source {
  img: HTMLImageElement;
  /** Image pixels per CSS pixel. */
  scale: number;
  /** The selection's position on screen (CSS px). */
  offset: { x: number; y: number };
}

export function drawShape(g: CanvasRenderingContext2D, s: Shape, scale: number, src?: Source) {
  const pts = s.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const w = s.size * scale;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = s.color;
  g.fillStyle = s.color;
  g.lineWidth = w;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  switch (s.tool) {
    case 'pen':
    case 'marker': {
      if (s.tool === 'marker') {
        g.globalAlpha = 0.38;
        g.lineWidth = w * 3.2;
        g.lineCap = 'square';
      }
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
      break;
    }
    case 'line':
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      break;
    case 'arrow': {
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const head = Math.max(12 * scale, w * 4);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x - Math.cos(ang) * head * 0.6, b.y - Math.sin(ang) * head * 0.6);
      g.stroke();
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - head * Math.cos(ang - 0.45), b.y - head * Math.sin(ang - 0.45));
      g.lineTo(b.x - head * Math.cos(ang + 0.45), b.y - head * Math.sin(ang + 0.45));
      g.closePath();
      g.fill();
      break;
    }
    case 'rect': {
      const r = Math.min(6 * scale, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2);
      g.beginPath();
      g.roundRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y), r);
      g.stroke();
      break;
    }
    case 'ellipse':
      g.beginPath();
      g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'text': {
      const size = (14 + s.size * 2) * scale;
      g.font = `600 ${size}px -apple-system, "Segoe UI", system-ui, sans-serif`;
      g.textBaseline = 'middle';
      g.lineWidth = size * 0.18;
      g.strokeStyle = s.color === '#FFFFFF' || s.color === '#FFD60A' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)';
      g.strokeText(s.label ?? '', a.x, a.y);
      g.fillText(s.label ?? '', a.x, a.y);
      break;
    }
    case 'number': {
      const r = (11 + s.size) * scale;
      g.beginPath();
      g.arc(a.x, a.y, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 2 * scale;
      g.strokeStyle = '#fff';
      g.stroke();
      g.fillStyle = s.color === '#FFFFFF' || s.color === '#FFD60A' ? '#111' : '#fff';
      g.font = `700 ${r * 1.1}px -apple-system, "Segoe UI", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s.label ?? '', a.x, a.y + r * 0.05);
      break;
    }
    case 'blur': {
      // Pixelate the area of the original picture under the rectangle.
      if (!src) break;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const rw = Math.abs(b.x - a.x);
      const rh = Math.abs(b.y - a.y);
      if (rw < 2 || rh < 2) break;
      const k = src.scale / scale; // image px per canvas px
      const block = Math.max(6, Math.round(12 * scale));
      const tw = Math.max(1, Math.round(rw / block));
      const th = Math.max(1, Math.round(rh / block));
      const tmp = document.createElement('canvas');
      tmp.width = tw;
      tmp.height = th;
      const t = tmp.getContext('2d')!;
      t.drawImage(src.img, (src.offset.x * scale + x) * k, (src.offset.y * scale + y) * k, rw * k, rh * k, 0, 0, tw, th);
      g.imageSmoothingEnabled = false;
      g.drawImage(tmp, 0, 0, tw, th, x, y, rw, rh);
      break;
    }
  }
  g.restore();
}
