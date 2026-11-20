import { describe, it, expect } from 'vitest';
import type { InputState } from '../../src/sim/types';
import { createWorld } from '../../src/sim/world';
import { stepTick } from '../../src/sim/step';

function neutralInput(overrides: Partial<InputState> = {}): InputState {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    ...overrides
  };
}

describe('stepTick simulation rules', () => {
  it('moves player according to cam_yaw_deg and normalizes diagonal input', () => {
    const w0 = createWorld(1, { random_motes: false, random_shades: false, motes: [], shades: [] });
    stepTick(w0, neutralInput({ move: [0, 1], cam_yaw_deg: 0 }));
    expect(w0.player.pos[0]).toBeCloseTo(0, 6);
    expect(w0.player.pos[2]).toBeCloseTo(7 / 60, 6);

    const w90 = createWorld(1, { random_motes: false, random_shades: false, motes: [], shades: [] });
    stepTick(w90, neutralInput({ move: [0, 1], cam_yaw_deg: 90 }));
    expect(w90.player.pos[0]).toBeCloseTo(7 / 60, 6);
    expect(w90.player.pos[2]).toBeCloseTo(0, 6);

    const w180 = createWorld(1, { random_motes: false, random_shades: false, motes: [], shades: [] });
    stepTick(w180, neutralInput({ move: [0, 1], cam_yaw_deg: 180 }));
    expect(w180.player.pos[0]).toBeCloseTo(0, 6);
    expect(w180.player.pos[2]).toBeCloseTo(-7 / 60, 6);

    const wDiag = createWorld(1, { random_motes: false, random_shades: false, motes: [], shades: [] });
    stepTick(wDiag, neutralInput({ move: [1, 1], cam_yaw_deg: 0 }));
    const dist = Math.hypot(wDiag.player.pos[0], wDiag.player.pos[2]);
    expect(dist).toBeCloseTo(7 / 60, 6);
  });

  it('triggers interact only on false->true rising edge when held across ticks', () => {
    const world = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      player: { pos: [0, 0, 21.5], carried: 3, flames: 3 }
    });

    const e1 = stepTick(world, neutralInput({ interact: true }));
    const e2 = stepTick(world, neutralInput({ interact: true }));
    const e3 = stepTick(world, neutralInput({ interact: true }));

    expect(e1).toHaveLength(1);
    expect(e1[0]).toEqual({
      type: 'event',
      tick: 1,
      name: 'deposit',
      data: { lantern_id: 'L1', amount: 3, deposited: 3 }
    });
    expect(e2).toEqual([]);
    expect(e3).toEqual([]);
    expect(world.player.carried).toBe(0);
    expect(world.lanterns[0].deposited).toBe(3);
  });

  it('jumps and lands inside island, and penalizes falling below Y <= -4.0 even if invulnerable', () => {
    const jumpWorld = createWorld(1, { random_motes: false, random_shades: false, motes: [], shades: [] });
    stepTick(jumpWorld, neutralInput({ jump: true }));
    expect(jumpWorld.player.pos[1]).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) {
      stepTick(jumpWorld, neutralInput({ jump: false }));
    }
    expect(jumpWorld.player.pos[1]).toBe(0);

    const fallWorld = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      player: { pos: [36.05, 0, 0], carried: 1, flames: 3 }
    });
    fallWorld.player.invulnRemaining = 1.5;

    let hitEvent = null;
    for (let i = 0; i < 60; i++) {
      const evs = stepTick(fallWorld, neutralInput());
      const found = evs.find((e) => e.name === 'player_hit');
      if (found) {
        hitEvent = found;
        break;
      }
    }

    expect(hitEvent).toBeTruthy();
    expect(hitEvent?.data).toEqual({ by: 'fall', flames: 2, dropped: 0 });
    expect(fallWorld.player.pos).toEqual([0, 0, 0]);
    expect(fallWorld.player.carried).toBe(1);
    expect(fallWorld.player.invulnRemaining).toBe(1.5);
  });

  it('picks motes within pickup_radius up to carry_capacity', () => {
    const world = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [
        [0, 0, 1.5],
        [0, 0, 1.8],
        [0, 0, 1.81]
      ],
      shades: [],
      player: { pos: [0, 0, 0], carried: 9, flames: 3 }
    });

    const evs = stepTick(world, neutralInput());
    expect(evs).toEqual([{ type: 'event', tick: 1, name: 'mote_picked', data: { carried: 10 } }]);
    expect(world.player.carried).toBe(10);
    expect(world.score).toBe(10);
    expect(world.motes).toHaveLength(2);
  });

  it('executes pulse before shade contact on the same tick, rescuing player', () => {
    const world = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0, 1, 1.0] }],
      player: { pos: [0, 0, 0], carried: 2, flames: 3 }
    });

    const evs = stepTick(world, neutralInput({ pulse: true }));
    expect(evs).toEqual([{ type: 'event', tick: 1, name: 'pulse', data: { stunned_ids: ['S1'] } }]);
    expect(world.player.flames).toBe(3);
    expect(world.player.carried).toBe(0);
    expect(world.score).toBe(25);
    expect(world.shades[0].state).toBe('stunned');
    expect(world.shades[0].pos[2]).toBeCloseTo(6.0, 4);
  });

  it('prioritizes all_lit win over dawn timeout on the exact final tick', () => {
    const world = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      time_left_s: 1 / 60,
      player: { pos: [0, 0, 0], carried: 1, flames: 3 },
      lanterns: [
        { id: 'L1', lit: true, deposited: 4 },
        { id: 'L2', lit: true, deposited: 4 },
        { id: 'L3', lit: true, deposited: 4 },
        { id: 'L4', lit: true, deposited: 4 },
        { id: 'L5', pos: [0, 0, 1], lit: false, deposited: 3 }
      ]
    });

    const evs = stepTick(world, neutralInput({ interact: true }));
    expect(world.status).toBe('won');
    expect(evs.map((e) => e.name)).toEqual(['deposit', 'lantern_lit', 'game_over']);
    expect(evs[2].data).toEqual({ result: 'won', reason: 'all_lit' });
    expect(world.score).toBe(450); // 150 + 0*5 + 3*100
  });

  it('keeps shades outside overlapping safe_radius with deterministic CCW collinear tie-break, and stops on no_flames', () => {
    const safeWorld = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0, 1, 15.5] }],
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      lanterns: [
        { id: 'L1', pos: [0, 0, 10], lit: true, deposited: 4 },
        { id: 'L2', pos: [2, 0, 10], lit: true, deposited: 4 }
      ]
    });

    for (let i = 0; i < 30; i++) {
      stepTick(safeWorld, neutralInput());
      const s = safeWorld.shades[0];
      const d1 = Math.hypot(s.pos[0] - 0, s.pos[2] - 10);
      const d2 = Math.hypot(s.pos[0] - 2, s.pos[2] - 10);
      expect(d1).toBeGreaterThanOrEqual(5.499);
      expect(d2).toBeGreaterThanOrEqual(5.499);
    }
    expect(safeWorld.shades[0].pos[0]).not.toBe(0);

    const loseWorld = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0, 1, 0.8] }],
      player: { pos: [0, 0, 0], carried: 4, flames: 1 }
    });

    const evs = stepTick(loseWorld, neutralInput());
    expect(loseWorld.status).toBe('lost');
    expect(evs).toEqual([
      { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: 0, dropped: 2 } },
      { type: 'event', tick: 1, name: 'game_over', data: { result: 'lost', reason: 'no_flames' } }
    ]);
    expect(stepTick(loseWorld, neutralInput())).toEqual([]);
    expect(loseWorld.simTick).toBe(1);
  });
});
