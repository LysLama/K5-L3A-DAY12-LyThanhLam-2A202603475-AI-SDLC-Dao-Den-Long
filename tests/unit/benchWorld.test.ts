import { describe, expect, it } from 'vitest';
import type { InputState } from '../../src/sim/types';
import { stepTick } from '../../src/sim/step';
import { buildSnapshot, createBenchWorld } from '../../src/sim/world';

const NO_INPUT: InputState = {
  move: [0, 0],
  cam_yaw_deg: 0,
  jump: false,
  interact: false,
  pulse: false,
  dash: false,
  pause: false
};

describe('createBenchWorld & benchMode simulation (Contract v1.3)', () => {
  it('spawns 200 wander shades, 100 motes on Night 1 with L1-L3 lit (fuel 100), deterministic on seed 42', () => {
    const w1 = createBenchWorld(42);
    const w2 = createBenchWorld(42);

    expect(w1.night).toBe(1);
    expect(w1.benchMode).toBe(true);
    expect(w1.player.pos).toEqual([0, 0, 0]);
    expect(w1.shades).toHaveLength(200);
    expect(w1.shades.every((s) => s.state === 'wander')).toBe(true);
    expect(w1.motes).toHaveLength(100);

    expect(w1.lanterns[0].lit).toBe(true);
    expect(w1.lanterns[1].lit).toBe(true);
    expect(w1.lanterns[2].lit).toBe(true);
    expect(w1.lanterns[3].lit).toBe(false);
    expect(w1.lanterns[4].lit).toBe(false);

    const snap1 = buildSnapshot(w1);
    expect(snap1.lanterns[0].fuel).toBe(100);
    expect(snap1.lanterns[1].fuel).toBe(100);
    expect(snap1.lanterns[2].fuel).toBe(100);
    expect(snap1).toEqual(buildSnapshot(w2));
  });

  it('keeps fuel fixed at 100, disables pickups/damage/end conditions, and lets 200 shades wander normally', () => {
    const w = createBenchWorld(42);
    const initialShadePositions = w.shades.map((s) => [...s.pos]);
    const allEvents = [];

    for (let i = 0; i < 180; i++) {
      allEvents.push(...stepTick(w, NO_INPUT));
    }

    expect(w.status).toBe('playing');
    expect(w.player.pos).toEqual([0, 0, 0]);
    expect(w.player.flames).toBe(3);
    expect(w.shades).toHaveLength(200);
    expect(w.shades.every((s) => s.state === 'wander')).toBe(true);
    expect(w.motes).toHaveLength(100);
    expect(w.lanterns[0].fuelTicks).toBe(6000);
    expect(w.lanterns[1].fuelTicks).toBe(6000);
    expect(w.lanterns[2].fuelTicks).toBe(6000);
    expect(allEvents).toHaveLength(0);

    const movedCount = w.shades.filter(
      (s, i) =>
        Math.hypot(
          s.pos[0] - initialShadePositions[i][0],
          s.pos[2] - initialShadePositions[i][2]
        ) > 0.5
    ).length;
    expect(movedCount).toBeGreaterThan(150);
  });
});
