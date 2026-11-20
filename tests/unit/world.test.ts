import { describe, it, expect } from 'vitest';
import contract from '../../game.contract.json';
import { TUNING } from '../../src/sim/constants';
import { allocateNextId, buildSnapshot, createWorld } from '../../src/sim/world';

describe('world & scenario initialization (Contract v1.2)', () => {
  it('syncs TUNING deeply with game.contract.json v1.2', () => {
    expect(contract.contract_version).toBe('1.2');
    expect(TUNING).toEqual(contract.tuning);
  });

  it('creates deterministic Night 1 defaults (20 distinct motes, 0 initial shades, 5 lanterns, 240s, fuel=0, capacity=10)', () => {
    const w1 = createWorld(42, undefined, 1);
    const w2 = createWorld(42, undefined, 1);
    const w3 = createWorld(99, undefined, 1);

    expect(w1.night).toBe(1);
    expect(w1.status).toBe('playing');
    expect(w1.score).toBe(0);
    expect(w1.timeLeftS).toBe(240);
    expect(w1.player.pos).toEqual([0, 0, 0]);
    expect(w1.player.vel).toEqual([0, 0, 0]);
    expect(w1.player.grounded).toBe(true);
    expect(w1.player.flames).toBe(3);
    expect(w1.player.capacity).toBe(10);

    expect(w1.lanterns.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    expect(w1.lanterns[0].pos).toEqual([0, 0, 25]);
    expect(w1.motes).toHaveLength(20);
    expect(w1.shades).toHaveLength(0);

    const snap1 = buildSnapshot(w1);
    expect(snap1).toEqual(buildSnapshot(w2));
    expect(snap1.night).toBe(1);
    expect(snap1.player.capacity).toBe(10);
    expect(snap1.lanterns[0]).toMatchObject({
      id: 'L1',
      lit: false,
      deposited: 0,
      fuel: 0,
      ever_lit: false,
      relit_count: 0
    });
    expect(snap1.motes).not.toEqual(buildSnapshot(w3).motes);
  });

  it('initializes Night 2/3 durations (270/300s) and Contract v1.2 scenario overrides (fuel, ever_lit, successful_lights, drain target)', () => {
    const n2 = createWorld(7, undefined, 2);
    expect(n2.timeLeftS).toBe(270);
    expect(n2.lanterns).toHaveLength(6);

    const n3 = createWorld(7, undefined, 3);
    expect(n3.timeLeftS).toBe(300);
    expect(n3.lanterns).toHaveLength(7);

    const custom = createWorld(
      7,
      {
        player: { pos: [1, 0, -2], carried: 3, flames: 2, successful_lights: 6 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S5', pos: [5, 1, 5], state: 'drain', target_lantern_id: 'L2' }],
        lanterns: [
          { id: 'L1', lit: true },
          { id: 'L2', lit: true, fuel: 25.5, ever_lit: true },
          { id: 'L3', lit: false, ever_lit: true }
        ],
        time_left_s: 200
      },
      2
    );

    expect(custom.player.successfulLights).toBe(6);
    expect(custom.player.capacity).toBe(20); // min(20, 10 + 2*6) = 20
    expect(custom.shades[0].state).toBe('drain');
    expect(custom.shades[0].targetLanternId).toBe('L2');

    const snap = buildSnapshot(custom);
    expect(snap.player.capacity).toBe(20);
    expect(snap.lanterns[0]).toMatchObject({ id: 'L1', lit: true, fuel: 100, ever_lit: true });
    expect(snap.lanterns[1]).toMatchObject({ id: 'L2', lit: true, fuel: 25.5, ever_lit: true });
    expect(snap.lanterns[2]).toMatchObject({ id: 'L3', lit: false, fuel: 0, ever_lit: true });
    expect(allocateNextId(custom, 'S')).toBe('S6');
  });
});
