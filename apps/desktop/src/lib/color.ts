// Dominant colour of a cover, for tinting the panel. Works for data: URLs and CORS-enabled images.
const cache = new Map<string, string | null>();

export async function coverColor(src: string): Promise<string | null> {
  if (cache.has(src)) return cache.get(src)!;
  const color = await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 16, 16);
        const d = ctx.getImageData(0, 0, 16, 16).data;
        let best = { score: -1, r: 40, g: 60, b: 120 };
        let sum = { r: 0, g: 0, b: 0 };
        for (let i = 0; i < d.length; i += 4) {
          const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
          sum = { r: sum.r + r, g: sum.g + g, b: sum.b + b };
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max ? (max - min) / max : 0;
          const score = sat * (0.4 + max / 425); // vivid but not dark
          if (score > best.score) best = { score, r, g, b };
        }
        const n = d.length / 4;
        // Blend the most vivid pixel with the average so the tint stays calm.
        const mix = (a: number, avg: number) => Math.round(a * 0.65 + (avg / n) * 0.35);
        resolve(`rgb(${mix(best.r, sum.r)}, ${mix(best.g, sum.g)}, ${mix(best.b, sum.b)})`);
      } catch {
        resolve(null); // tainted canvas (no CORS)
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(src, color);
  return color;
}
