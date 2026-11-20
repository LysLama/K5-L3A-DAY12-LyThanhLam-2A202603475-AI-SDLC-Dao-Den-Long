import { describe, it, expect } from 'vitest';
import contract from '../../game.contract.json';
import { TUNING } from '../../src/sim/constants';
import { allocateNextId, buildSnapshot, createWorld } from '../../src/sim/world';

describe('world & scenario initialization', () => {
  it('syncs TUNING deeply with game.contract.json', () => {
    expect(TUNING).toEqual(contract.tuning);
  });

  it('creates deterministic Night 1 defaults for the same seed', () => {
    const w1 = createWorld(42);
    const w2 = createWorld(42);
    const w3 = createWorld(99);

    expect(w1.status).toBe('playing');
    expect(w1.score).toBe(0);
    expect(w1.timeLeftS).toBe(240);
    expect(w1.player.pos).toEqual([0, 0, 0]);
    expect(w1.player.flames).toBe(3);
    expect(w1.player.carried).toBe(0);

    expect(w1.lanterns.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    expect(w1.lanterns[0].pos).toEqual([0, 0, 22]);
    expect(w1.lanterns.every((l) => !l.lit && l.deposited === 0)).toBe(true);

    expect(w1.motes).toHaveLength(28);
    for (const m of w1.motes) {
      const r = Math.hypot(m.pos[0], m.pos[2]);
      expect(m.pos[1]).toBe(0);
      expect(r).toBeGreaterThanOrEqual(6);
      expect(r).toBeLessThanOrEqual(30);
    }

    expect(w1.shades).toHaveLength(3);
    for (const s of w1.shades) {
      const r = Math.hypot(s.pos[0], s.pos[2]);
      expect(s.state).toBe('chase');
      expect(s.pos[1]).toBe(1);
      expect(r).toBeGreaterThanOrEqual(26);
      expect(r).toBeLessThanOrEqual(32);
    }

    expect(buildSnapshot(w1)).toEqual(buildSnapshot(w2));
    expect(buildSnapshot(w1).motes).not.toEqual(buildSnapshot(w3).motes);
  });

  it('merges scenario lanterns without scoring and replaces motes/shades cleanly', () => {
    const world = createWorld(7, {
      player: { pos: [1, 0, -2], carried: 3, flames: 2 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 5]],
      shades: [{ id: 'S5', pos: [10, 0, 0] }],
      lanterns: [{ id: 'L2', pos: [5, 0, 5], deposited: 4, lit: true }],
      time_left_s: 300
    });

    expect(world.score).toBe(0);
    expect(world.timeLeftS).toBe(300);
    expect(world.player.pos).toEqual([1, 0, -2]);
    expect(world.player.carried).toBe(3);
    expect(world.player.flames).toBe(2);

    expect(world.lanterns).toHaveLength(5);
    const l2 = world.lanterns.find((l) => l.id === 'L2');
    const l1 = world.lanterns.find((l) => l.id === 'L1');
    expect(l2).toEqual({ id: 'L2', pos: [5, 0, 5], deposited: 4, lit: true });
    expect(l1).toEqual({ id: 'L1', pos: [0, 0, 22], deposited: 0, lit: false });

    expect(world.motes).toEqual([{ id: 'M1', pos: [0, 0, 5] }]);
    expect(world.shades).toHaveLength(1);
    expect(world.shades[0].id).toBe('S5');
    expect(world.shades[0].pos).toEqual([10, 0, 0]);
    expect(world.shades[0].state).toBe('chase');

    expect(allocateNextId(world, 'S')).toBe('S6');
    expect(allocateNextId(world, 'M')).toBe('M2');
  });

  it('allows empty motes and shades arrays when random spawning is disabled', () => {
    const world = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: []
    });

    expect(world.motes).toEqual([]);
    expect(world.shades).toEqual([]);
  });
});
