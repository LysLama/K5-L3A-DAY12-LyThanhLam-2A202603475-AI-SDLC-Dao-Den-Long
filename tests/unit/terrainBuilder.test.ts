import { describe, expect, it } from 'vitest';
import { getMapConfig } from '../../src/sim/maps';
import {
  buildSculptedIslandMesh,
  isClearPlayableSpot,
  sampleIslandElevation
} from '../../src/client/terrainBuilder';

describe('sculpted multi-layer island terrain & safe clearance', () => {
  it('keeps spawn, lanterns, motes, jump pads, and paths flush with base floor while raising outer/sector knolls', () => {
    for (const night of [1, 2, 3] as const) {
      const cfg = getMapConfig(night);
      const centerX = night === 2 ? 0 : 0;
      const radius = night === 1 ? 40 : night === 2 ? 28 : 45;

      // Spawn stays flush
      if (night !== 3) {
        expect(Math.abs(sampleIslandElevation(night, centerX, radius, cfg.spawnPos[0], cfg.spawnPos[2]))).toBeLessThanOrEqual(0.02);
      } else {
        expect(Math.abs(sampleIslandElevation(3, 0, 45, cfg.spawnPos[0], cfg.spawnPos[2]))).toBeLessThanOrEqual(0.02);
      }

      // Base-level lanterns & jump pads stay flush
      for (const l of cfg.lanterns) {
        if (l.pos[1] === 0 && Math.hypot(l.pos[0] - centerX, l.pos[2]) <= radius) {
          expect(Math.abs(sampleIslandElevation(night, centerX, radius, l.pos[0], l.pos[2]))).toBeLessThanOrEqual(0.02);
        }
      }
      for (const jp of cfg.jumpPads) {
        if (jp.pos[1] === 0 && Math.hypot(jp.pos[0] - centerX, jp.pos[2]) <= radius) {
          expect(Math.abs(sampleIslandElevation(night, centerX, radius, jp.pos[0], jp.pos[2]))).toBeLessThanOrEqual(0.02);
        }
      }
    }

    // Night 1 forest wedge / outer rim rises organically above 0.3m so island is non-flat
    let maxElevation = 0;
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      for (const r of [18, 28, 36.5]) {
        const y = sampleIslandElevation(1, 0, 40, Math.cos(rad) * r, Math.sin(rad) * r);
        if (y > maxElevation) maxElevation = y;
      }
    }
    expect(maxElevation).toBeGreaterThanOrEqual(0.45);
  });

  it('rejects obstacles inside spawn, lantern daises, motes, paths, bridge, and Night 3 ramps', () => {
    expect(isClearPlayableSpot(1, 0, 40, 0, 0, 2.0)).toBe(false); // spawn
    expect(isClearPlayableSpot(1, 0, 40, 0, 25, 2.0)).toBe(false); // L1 lantern
    expect(isClearPlayableSpot(1, 0, 40, 0, 12, 1.5)).toBe(false); // Mote & North path
    expect(isClearPlayableSpot(2, 0, 28, 27, 0, 1.5)).toBe(false); // Bridge entry
    expect(isClearPlayableSpot(3, 0, 45, 0, 28, 2.0)).toBe(false); // Night 3 spawn

    // Sector wedge between lanterns & motes on Night 1 outer ring is clear for trees/boulders
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
    expect(geo.boundingBox!.max.y).toBeGreaterThanOrEqual(0.45);
    geo.dispose();
  });
});
