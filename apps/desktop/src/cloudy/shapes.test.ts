import { describe, expect, it } from 'vitest';
import { PUFFS, SHAPES, SHOW_SHAPES, SHAPE_NAMES, scatter } from './shapes';

describe('Cloudy shapes', () => {
  it('every shape uses exactly the same 16 puffs, so morphs are smooth', () => {
    for (const [id, s] of Object.entries(SHAPES)) {
      expect(s.puffs, id).toHaveLength(PUFFS);
      for (const [x, y, r] of s.puffs) {
        expect(Number.isFinite(x) && Number.isFinite(y) && r > 0, id).toBe(true);
        expect(x > -20 && x < 142 && y > -10 && y < 106, `${id} puff inside`).toBe(true);
      }
    }
  });
  it('shapes he shows off have a name', () => {
    for (const id of SHOW_SHAPES) expect(SHAPE_NAMES[id][1].length).toBeGreaterThan(0);
  });
  it('dissolving scatters puffs outward', () => {
    SHAPES.cloud.puffs.forEach((p, i) => {
      const [dx, dy] = scatter(p, i);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(15);
    });
  });
});
