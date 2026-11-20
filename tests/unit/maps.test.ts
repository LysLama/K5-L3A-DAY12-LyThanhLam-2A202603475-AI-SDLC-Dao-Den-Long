import { describe, expect, it } from 'vitest';
import {
  getMapConfig,
  getHighestGroundAt,
  isInBellTower,
  resolveMovementObstacles
} from '../../src/sim/maps';

describe('Phase 2 maps & terrain geometry', () => {
  it('defines exact Night 1, 2, 3 lantern counts, spawn points, jump pads, and charms', () => {
    const n1 = getMapConfig(1);
    expect(n1.lanterns).toHaveLength(5);
    expect(n1.moteSpawnPoints).toHaveLength(24);
    expect(n1.shadeSpawnPoints).toHaveLength(12);
    expect(n1.charms).toHaveLength(0);
    expect(n1.durationS).toBe(300);

    const n2 = getMapConfig(2);
    expect(n2.lanterns).toHaveLength(6);
    expect(n2.lanterns[3].pos).toEqual([70, 0, 20]);
    expect(n2.moteSpawnPoints).toHaveLength(24);
    expect(n2.shadeSpawnPoints).toHaveLength(16);
    expect(n2.jumpPads).toHaveLength(2);
    expect(n2.charms).toEqual([{ id: 'C1', pos: [35, 0, 0] }]);
    expect(n2.durationS).toBe(330);

    const n3 = getMapConfig(3);
    expect(n3.lanterns).toHaveLength(7);
    expect(n3.lanterns[0].pos).toEqual([0, 6, 6]);
    expect(n3.moteSpawnPoints).toHaveLength(30);
    expect(n3.shadeSpawnPoints).toHaveLength(16);
    expect(n3.jumpPads).toHaveLength(1);
    expect(n3.charms).toEqual([
      { id: 'C1', pos: [30, 0, 25] },
      { id: 'C2', pos: [-30, 0, 25] }
    ]);
    expect(n3.durationS).toBe(360);
  });

  it('resolves Night 2 twin islands and bamboo bridge accurately', () => {
    expect(getHighestGroundAt(2, 0, 0, 0)).toBe(0);
    expect(getHighestGroundAt(2, 70, 0, 0)).toBe(0);
    expect(getHighestGroundAt(2, 35, 0, 0)).toBe(0); // on bridge
    expect(getHighestGroundAt(2, 35, 2.1, 0)).toBeNull(); // fell off bridge side
    expect(getHighestGroundAt(2, 29, 10, 0)).toBeNull(); // gap between islands
  });

  it('resolves Night 3 3-tier platforms, 30/150 deg ramps, cliff walls, and Bell Tower', () => {
    expect(getHighestGroundAt(3, 0, 6, 6)).toBe(6); // Tier 2
    expect(getHighestGroundAt(3, 0, 18, 3)).toBe(3); // Tier 1 (12..24, z>0)
    expect(getHighestGroundAt(3, 0, -18, 3)).toBe(0); // z < 0 has only Tier 0
    expect(getHighestGroundAt(3, 46, 0, 0)).toBeNull();

    // Ramp at 30 deg: r=30 -> y=0, r=27 -> y=1.5, r=24 -> y=3
    const rad30 = (30 * Math.PI) / 180;
    expect(getHighestGroundAt(3, 27 * Math.cos(rad30), 27 * Math.sin(rad30), 1.5)).toBeCloseTo(1.5, 4);

    // Bell Tower blocks (0, 6, 0) within r < 2
    expect(isInBellTower(3, 1.5, 6, 0)).toBe(true);
    expect(isInBellTower(3, 2.1, 6, 0)).toBe(false);

    // Cliff wall prevents walking horizontally from Tier 0 (y=0) straight through Tier 2 (r<8)
    const blocked = resolveMovementObstacles(3, 8.2, 0, 7.8, 0, 0);
    expect(Math.hypot(blocked[0], blocked[1])).toBeGreaterThanOrEqual(8.0);
  });
});
