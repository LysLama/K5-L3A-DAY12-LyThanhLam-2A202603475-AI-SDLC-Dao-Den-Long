import { describe, it, expect } from 'vitest';
import contract from '../../game.contract.json';
import { TUNING } from '../../src/sim/constants';
import { allocateNextId, buildSnapshot, createWorld } from '../../src/sim/world';

describe('world & scenario initialization (Contract v1.1)', () => {
  it('syncs TUNING deeply with game.contract.json v1.1', () => {
    expect(TUNING).toEqual(contract.tuning);
  });

  it('creates deterministic Night 1 defaults (20 distinct motes, 0 initial shades, 5 lanterns, 300s)', () => {
    const w1 = createWorld(42, undefined, 1);
    const w2 = createWorld(42, undefined, 1);
    const w3 = createWorld(99, undefined, 1);

    expect(w1.night).toBe(1);
    expect(w1.status).toBe('playing');
    expect(w1.score).toBe(0);
    expect(w1.timeLeftS).toBe(300);
    expect(w1.player.pos).toEqual([0, 0, 0]);
    expect(w1.player.vel).toEqual([0, 0, 0]);
    expect(w1.player.grounded).toBe(true);
    expect(w1.player.flames).toBe(3);

    expect(w1.lanterns.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    expect(w1.lanterns[0].pos).toEqual([0, 0, 25]);
    expect(w1.motes).toHaveLength(20);
    const uniqueKeys = new Set(w1.motes.map((m) => m.pos.join(',')));
    expect(uniqueKeys.size).toBe(20);
    expect(w1.shades).toHaveLength(0); // 2 shades spawn at tick 300
    expect(w1.drifters).toHaveLength(0);
    expect(w1.charms).toHaveLength(0);

    const snap1 = buildSnapshot(w1);
    expect(snap1).toEqual(buildSnapshot(w2));
    expect(snap1.night).toBe(1);
    expect(snap1.wind).toEqual({ active: false, dir_deg: 0 });
    expect(snap1.player.invuln).toBe(false);
    expect(snap1.motes).not.toEqual(buildSnapshot(w3).motes);
  });

  it('initializes Night 2 and Night 3 maps, charms, and v1.1 scenario overrides cleanly', () => {
    const n2 = createWorld(7, undefined, 2);
    expect(n2.night).toBe(2);
    expect(n2.timeLeftS).toBe(330);
    expect(n2.lanterns).toHaveLength(6);
    expect(n2.charms).toEqual([{ id: 'C1', pos: [35, 0, 0], available: true, respawnTicks: 0 }]);

    const n3 = createWorld(7, undefined, 3);
    expect(n3.night).toBe(3);
    expect(n3.timeLeftS).toBe(360);
    expect(n3.lanterns).toHaveLength(7);
    expect(n3.wind.enabled).toBe(true);
    expect(n3.charms).toHaveLength(2);

    const custom = createWorld(
      7,
      {
        player: { pos: [1, 0, -2], carried: 3, flames: 2, invuln_ticks: 30, dash_cd_ticks: 45, pulse_cd_ticks: 60, charm_ticks: 120 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        motes: [[0, 0, 5], { id: 'M1', pos: [0, 0, 7] }],
        shades: [{ id: 'S5', pos: [10, 1, 0], state: 'wander', state_ticks_left: 50 }],
        drifters: [{ pos: [20, 1.5, 0], state: 'idle', stolen: 0 }],
        charms: [{ id: 'C1', available: false, respawn_s: 12 }],
        lanterns: [{ id: 'L2', pos: [5, 0, 5], deposited: 10, lit: true }],
        time_left_s: 250
      },
      2
    );

    expect(custom.score).toBe(0);
    expect(custom.player.invulnTicks).toBe(30);
    expect(custom.player.dashCdTicks).toBe(45);
    expect(custom.player.pulseCdTicks).toBe(60);
    expect(custom.player.charmTicks).toBe(120);
    expect(custom.motes.map((m) => m.id)).toEqual(['M2', 'M1']);
    expect(custom.shades[0].state).toBe('wander');
    expect(custom.shades[0].stateTicksLeft).toBe(50);
    expect(custom.drifters).toHaveLength(1);
    expect(custom.drifters[0].id).toBe('D1');
    expect(custom.charms[0]).toEqual({ id: 'C1', pos: [35, 0, 0], available: false, respawnTicks: 720 });
    expect(allocateNextId(custom, 'S')).toBe('S6');
    expect(allocateNextId(custom, 'D')).toBe('D2');
  });
});
