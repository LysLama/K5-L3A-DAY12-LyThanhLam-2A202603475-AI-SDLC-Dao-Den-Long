import { describe, expect, it } from 'vitest';
import { getMapConfig } from '../../src/sim/maps';
import {
  buildSculptedIslandMesh,
  getVisualGroundLift,
  isClearPlayableSpot,
  sampleIslandElevation
} from '../../src/client/terrainBuilder';

describe('sculpted multi-layer island terrain, grounding & safe clearance', () => {
  it('pins spawn, lanterns, bridge, and Night 3 sanctuaries while forming smooth rolling hills inside clearings', () => {
    for (const night of [1, 2, 3] as const) {
      const cfg = getMapConfig(night);
      expect(Math.abs(sampleIslandElevation(night, 0, night === 1 ? 40 : night === 2 ? 28 : 45, cfg.spawnPos[0], cfg.spawnPos[2]))).toBeLessThanOrEqual(0.02);

      for (const l of cfg.lanterns) {
        if (l.pos[1] === 0 && (night !== 2 || l.pos[0] < 35)) {
          const rad = night === 1 ? 40 : night === 2 ? 28 : 45;
          expect(Math.abs(sampleIslandElevation(night, 0, rad, l.pos[0], l.pos[2]))).toBeLessThanOrEqual(0.02);
        }
      }
    }

    // Rolling interior meadow hills + outer bluffs reach substantial 3D relief
    let midHillMax = 0;
    let outerHillMax = 0;
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const yMid = sampleIslandElevation(1, 0, 40, Math.cos(rad) * 20, Math.sin(rad) * 20);
      const yOut = sampleIslandElevation(1, 0, 40, Math.cos(rad) * 35.5, Math.sin(rad) * 35.5);
      if (yMid > midHillMax) midHillMax = yMid;
      if (yOut > outerHillMax) outerHillMax = yOut;
    }
    expect(midHillMax).toBeGreaterThanOrEqual(0.45);
    expect(outerHillMax).toBeGreaterThanOrEqual(0.95);
  });

  it('aligns getVisualGroundLift cleanly with terrain height so characters never sink through hills', () => {
    // Grounded actor inside a Night 1 rolling hill receives exact terrain lift
    const a = (54 * Math.PI) / 180;
    const hx = Math.cos(a) * 20;
    const hz = Math.sin(a) * 20;
    const expected = sampleIslandElevation(1, 0, 40, hx, hz);
    expect(getVisualGroundLift(1, hx, hz, 0)).toBeCloseTo(expected, 5);
    // Mid-air jump still preserves terrain clearance above hill
    expect(getVisualGroundLift(1, hx, hz, 1.5)).toBeCloseTo(expected, 5);
    // Falling off island edge does not lift character back up
    expect(getVisualGroundLift(1, 41.5, 0, -2.0)).toBe(0);
    // Night 3 Tier 1 & Tier 2 platforms keep exact sim elevation without extra lift
    expect(getVisualGroundLift(3, 0, 18, 3.0)).toBe(0);
    expect(getVisualGroundLift(3, 0, 4, 6.0)).toBe(0);
  });

  it('rejects obstacles inside spawn, lantern daises, motes, paths, bridge, and Night 3 ramps', () => {
    expect(isClearPlayableSpot(1, 0, 40, 0, 0, 2.0)).toBe(false);
    expect(isClearPlayableSpot(1, 0, 40, 0, 25, 2.0)).toBe(false);
    expect(isClearPlayableSpot(1, 0, 40, 0, 12, 1.5)).toBe(false);
    expect(isClearPlayableSpot(2, 0, 28, 27, 0, 1.5)).toBe(false);
    expect(isClearPlayableSpot(3, 0, 45, 0, 28, 2.0)).toBe(false);

    const a = (54 * Math.PI) / 180;
    expect(isClearPlayableSpot(1, 0, 40, Math.cos(a) * 35.5, Math.sin(a) * 35.5, 1.2)).toBe(true);
  });

  it('constructs valid finite sculpted terrain geometry with vertex colors & UVs', () => {
    const geo = buildSculptedIslandMesh(1, 0, 40);
    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const col = geo.getAttribute('color');
    const uv = geo.getAttribute('uv');
    expect(pos.count).toBeGreaterThan(200);
    expect(norm.count).toBe(pos.count);
    expect(col.count).toBe(pos.count);
    expect(uv.count).toBe(pos.count);
    for (let i = 0; i < pos.array.length; i++) {
      expect(Number.isFinite(pos.array[i])).toBe(true);
      expect(Number.isFinite(norm.array[i])).toBe(true);
    }
    geo.computeBoundingBox();
    expect(geo.boundingBox!.max.y).toBeGreaterThanOrEqual(0.9);
    geo.dispose();
  });
});
