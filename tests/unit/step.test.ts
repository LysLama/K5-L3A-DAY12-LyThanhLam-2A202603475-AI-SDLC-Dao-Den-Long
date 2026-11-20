import { describe, expect, it } from 'vitest';
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
    pause: false,
    ...overrides
  };
}

describe('stepTick Contract v1.2 rules (movement, fuel, drain, dawn_survived)', () => {
  it('accelerates/stops within <= 0.1s (6 ticks) and normalizes cam_yaw_deg movement', () => {
    const w = createWorld(1, { random_motes: false, random_shades: false, motes: [] }, 1);
    for (let i = 0; i < 6; i++) {
      stepTick(w, neutralInput({ move: [0, 1], cam_yaw_deg: 90 }));
    }
    expect(w.player.vel[0]).toBeCloseTo(6.0, 5);
    expect(w.player.vel[2]).toBeCloseTo(0, 5);

    for (let i = 0; i < 6; i++) {
      stepTick(w, neutralInput({ move: [0, 0], cam_yaw_deg: 90 }));
    }
    expect(w.player.vel[0]).toBeCloseTo(0, 5);
  });

  it('executes Dash (14 m/s, 12 ticks, 90-tick cd from start, holds Y in air) and Wind Charm (7.2 m/s, 0 cd)', () => {
    const w = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      charms: [{ id: 'C1', pos: [0, 0, 5], available: true }]
    }, 2);

    // Jump then dash in midair
    stepTick(w, neutralInput({ jump: true, move: [0, 1] }));
    const yBeforeDash = w.player.pos[1];
    const evDash = stepTick(w, neutralInput({ jump: false, dash: true, move: [0, 1] }));
    expect(evDash.some((e) => e.name === 'dash')).toBe(true);
    expect(w.player.pos[1]).toBeCloseTo(yBeforeDash, 5);
    expect(w.player.dashCdTicks).toBe(90);

    for (let i = 0; i < 11; i++) {
      stepTick(w, neutralInput({ dash: false, move: [0, 1] }));
      expect(w.player.pos[1]).toBeCloseTo(yBeforeDash, 5);
    }

    // Cannot dash again while on cooldown
    const blocked = stepTick(w, neutralInput({ dash: true, move: [0, 1] }));
    expect(blocked.some((e) => e.name === 'dash')).toBe(false);

    // Pick charm C1 -> speed 7.2 and dash cooldown resets to 0
    const charmWorld = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      player: { pos: [35, 0, 0], dash_cd_ticks: 50 }
    }, 2);
    const evCharm = stepTick(charmWorld, neutralInput());
    expect(evCharm.some((e) => e.name === 'charm_picked')).toBe(true);
    expect(charmWorld.player.charmTicks).toBe(600);
    expect(charmWorld.player.dashCdTicks).toBe(0);
    for (let i = 0; i < 8; i++) stepTick(charmWorld, neutralInput({ move: [1, 0] }));
    expect(charmWorld.player.vel[0]).toBeCloseTo(7.2, 5);
  });

  it('freezes sim_tick, time_left_s, cooldowns, and spawns while paused and resumes cleanly', () => {
    const w = createWorld(1, { random_motes: false, random_shades: false, motes: [], player: { dash_cd_ticks: 40 } }, 1);
    const evPause = stepTick(w, neutralInput({ pause: true }));
    expect(w.status).toBe('paused');
    expect(w.tick).toBe(1);
    expect(w.simTick).toBe(0);
    expect(w.timeLeftS).toBe(240);
    expect(w.player.dashCdTicks).toBe(40);
    expect(evPause).toEqual([{ type: 'event', tick: 1, name: 'paused', data: {} }]);

    stepTick(w, neutralInput({ pause: true, move: [0, 1] })); // held true -> stays paused
    expect(w.tick).toBe(2);
    expect(w.simTick).toBe(0);
    expect(w.player.pos).toEqual([0, 0, 0]);

    stepTick(w, neutralInput({ pause: false }));
    const evResume = stepTick(w, neutralInput({ pause: true }));
    expect(w.status).toBe('playing');
    expect(w.tick).toBe(4);
    expect(w.simTick).toBe(1);
    expect(w.player.dashCdTicks).toBe(39);
    expect(evResume[0]).toEqual({ type: 'event', tick: 4, name: 'resumed', data: {} });
  });

  it('launches across Night 2 jump pad ignoring move overrides until landing', () => {
    const w = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      player: { pos: [20, 0, 18] }
    }, 2);

    stepTick(w, neutralInput({ move: [-1, 0] })); // hit pad on tick 1
    expect(w.player.vel[1]).toBe(14.0);
    expect(w.player.launched).toBe(true);

    // Opposite input does NOT override jump pad launch while airborne
    for (let i = 0; i < 85; i++) {
      stepTick(w, neutralInput({ move: [-1, -1] }));
      if (w.player.grounded && i > 5) break;
    }
    expect(w.player.grounded).toBe(true);
    expect(Math.hypot(w.player.pos[0] - 70, w.player.pos[2])).toBeLessThanOrEqual(28);
  });

  it('enforces Pulse 3D radius 5m (Y+0.8), 15-tick +X fallback push, 120-tick stun, +5 score, and Gió Lạc steal/drop', () => {
    const w = createWorld(1, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      player: { pos: [0, 0, 0], carried: 6, flames: 3, invuln_ticks: 2 },
      shades: [{ id: 'S1', pos: [0, 0.8, 0], state: 'chase' }],
      drifters: [{ id: 'D1', pos: [0, 1.5, 1.0], state: 'chase' }]
    }, 2);

    // Drifter steals 3 before shade hits (and player drops carried to 3 -> pulse still affordable!)
    const ev1 = stepTick(w, neutralInput());
    expect(ev1.some((e) => e.name === 'drifter_steal' && e.data.amount === 3 && e.data.carried === 3)).toBe(true);
    expect(w.drifters[0].state).toBe('flee');

    // Pulse hits stunned S1 (push +X) and fleeing D1 (drops 3 motes!)
    const ev2 = stepTick(w, neutralInput({ pulse: true }));
    expect(ev2.some((e) => e.name === 'pulse' && e.data.stunned_ids.includes('S1'))).toBe(true);
    expect(ev2.some((e) => e.name === 'drifter_drop' && e.data.amount === 3)).toBe(true);
    expect(w.shades[0].state).toBe('stunned');
    expect(w.shades[0].stateTicksLeft).toBe(120);
    expect(w.score).toBe(5);
    expect(w.motes.filter((m) => m.kind === 'dropped')).toHaveLength(3);

    for (let i = 0; i < 15; i++) stepTick(w, neutralInput());
    expect(w.shades[0].pos[0]).toBeCloseTo(4.0, 2);
  });

  it('handles fall Y < -10 losing all motes, waiting 60 ticks, and respawning with 90-tick invuln', () => {
    const w = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      player: { pos: [40.5, -9.995, 0], carried: 7, flames: 3 }
    }, 1);

    const evFall = stepTick(w, neutralInput());
    expect(evFall).toContainEqual({
      type: 'event',
      tick: 1,
      name: 'player_hit',
      data: { by: 'fall', flames: 2, dropped: 0, lost: 7 }
    });
    expect(w.player.carried).toBe(0);
    expect(w.player.fallWaitTicks).toBe(60);

    for (let i = 0; i < 59; i++) {
      stepTick(w, neutralInput({ move: [1, 0] }));
    }
    expect(w.player.pos[0]).toBe(40.5);
    stepTick(w, neutralInput());
    expect(w.player.pos).toEqual([0, 0, 0]);
    expect(w.player.invulnTicks).toBe(90);
  });

  it('applies +5/mote +100 lantern v1.2 score without early all_lit win and pushes shades out of 6m safe zone', () => {
    const w = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0, 1, 27], state: 'chase' }],
      player: { pos: [0, 0, 24], carried: 1, flames: 3 },
      time_left_s: 100,
      lanterns: [
        { id: 'L1', pos: [0, 0, 25], deposited: 9, lit: false },
        { id: 'L2', lit: true, deposited: 10 },
        { id: 'L3', lit: true, deposited: 10 },
        { id: 'L4', lit: true, deposited: 10 },
        { id: 'L5', lit: true, deposited: 10 }
      ]
    }, 1);

    const evs = stepTick(w, neutralInput({ interact: true }));
    expect(evs.map((e) => e.name)).toEqual(['deposit', 'lantern_lit']);
    expect(w.status).toBe('playing'); // No early win on lighting all 5 lanterns!
    expect(w.score).toBe(5 + 100);
    expect(w.player.capacity).toBe(12);

    // Test 30-tick safe zone pushout when L1 lights with shade inside
    const w2 = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0, 1, 25.5], state: 'chase' }],
      player: { pos: [0, 0, 24], carried: 1, flames: 3 },
      lanterns: [{ id: 'L1', pos: [0, 0, 25], deposited: 9, lit: false }]
    }, 1);
    stepTick(w2, neutralInput({ interact: true }));
    for (let i = 0; i < 30; i++) stepTick(w2, neutralInput());
    expect(Math.hypot(w2.shades[0].pos[0] - 0, w2.shades[0].pos[2] - 25)).toBeGreaterThanOrEqual(5.99);
  });

  it('emits Night 3 wind after 30s (1800 ticks) pushing player 2 m/s', () => {
    const w = createWorld(42, { random_motes: false, random_shades: false, random_drifters: false, motes: [], wind_enabled: true }, 3);
    for (let i = 0; i < 1800; i++) {
      stepTick(w, neutralInput());
    }
    expect(w.wind.active).toBe(true);
    const posAtStart = [...w.player.pos];
    for (let i = 0; i < 60; i++) stepTick(w, neutralInput());
    const distPushed = Math.hypot(w.player.pos[0] - posAtStart[0], w.player.pos[2] - posAtStart[2]);
    expect(distPushed).toBeCloseTo(2.0, 2);
  });

  it('tracks player altitude when drifter chases on Night 3 Tier 2 so Pulse can hit it', () => {
    const w = createWorld(1, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      player: { pos: [0, 6, 4], carried: 6, flames: 3 },
      drifters: [{ id: 'D1', pos: [0, 1.5, 4.5], state: 'chase' }]
    }, 3);

    // Tick 1: drifter is 5.3m below Mây+0.8 on Y=6 -> must ascend smoothly before stealing from beneath floor!
    let stolenTick = -1;
    for (let i = 0; i < 90; i++) {
      const evs = stepTick(w, neutralInput());
      if (evs.some((e) => e.name === 'drifter_steal')) {
        stolenTick = i + 1;
        break;
      }
    }
    expect(stolenTick).toBeGreaterThan(1);
    expect(w.drifters[0].pos[1]).toBeGreaterThanOrEqual(4.8);
    // Immediate Pulse hits the fleeing drifter in 3D radius 5m!
    const pulseEvs = stepTick(w, neutralInput({ pulse: true }));
    expect(pulseEvs.some((e) => e.name === 'drifter_drop' && e.data.amount === 3)).toBe(true);
  });

  it('decays fuel at 1.0/s, emits lantern_out at 0, relights in 5 motes (+40), and scales capacity to max 20', () => {
    const w = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      player: { pos: [0, 0, 24], carried: 6, flames: 3, successful_lights: 4 },
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 1.0, ever_lit: true }]
    }, 1);
    expect(w.player.capacity).toBe(18);

    // 60 ticks of natural decay brings 1.0 -> 0 -> lantern_out
    let outEv: unknown = null;
    for (let i = 0; i < 60; i++) {
      const evs = stepTick(w, neutralInput());
      const found = evs.find((e) => e.name === 'lantern_out');
      if (found) outEv = found;
    }
    expect(outEv).toEqual({ type: 'event', tick: 60, name: 'lantern_out', data: { lantern_id: 'L1' } });
    expect(w.lanterns[0].lit).toBe(false);
    expect(w.lanterns[0].fuelTicks).toBe(0);
    expect(w.lanterns[0].deposited).toBe(0);
    expect(w.lanterns[0].everLit).toBe(true);

    // Relight takes only 5 motes and grants +5*5 + 40 = 65 score, capacity rises 18 -> 20
    const relightEvs = stepTick(w, neutralInput({ interact: true }));
    expect(relightEvs).toContainEqual({
      type: 'event',
      tick: 61,
      name: 'lantern_lit',
      data: { lantern_id: 'L1', relight: true }
    });
    expect(w.player.carried).toBe(1);
    expect(w.player.capacity).toBe(20);
    expect(w.lanterns[0].relitCount).toBe(1);
    expect(w.score).toBe(65);
  });

  it('refuels partial lanterns, skips full lanterns, enforces fuel == 30 safe zone boundary, and pushes shades when refueled >= 30', () => {
    const w = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      player: { pos: [0, 0, 24], carried: 10, flames: 3 },
      shades: [{ id: 'S1', pos: [0, 1, 26], state: 'drain', target_lantern_id: 'L1' }],
      lanterns: [
        { id: 'L2', pos: [0, 0, 24.5], lit: true, fuel: 100 }, // closer, but FULL -> must skip!
        { id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 } // missing 75 -> ceil(75/10)=8 -> uses 8 motes -> fuel 100
      ]
    }, 1);

    const refuelEvs = stepTick(w, neutralInput({ interact: true }));
    const refuel = refuelEvs.find((e) => e.name === 'refuel');
    expect(refuel).toBeDefined();
    expect(refuel?.data.lantern_id).toBe('L1');
    expect(refuel?.data.amount).toBe(8);
    expect(w.player.carried).toBe(2);
    expect(w.score).toBe(40); // 8 * 5
    expect(w.shades[0].state).not.toBe('drain'); // exited drain on refuel >= 30 and gets pushed out
    expect(w.shades[0].safePushTicksLeft).toBe(30);
    for (let i = 0; i < 30; i++) stepTick(w, neutralInput());
    expect(Math.hypot(w.shades[0].pos[0], w.shades[0].pos[2] - 25)).toBeGreaterThanOrEqual(5.99);

    // Safe zone stays ACTIVE at exact fuel == 30.0 (30.017 -> 30.0 after 1 tick)
    const w30 = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      shades: [{ id: 'S1', pos: [0, 1, 28], state: 'chase' }],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 30.01667 }] // 1801 ticks -> 1800 after step 2 = exact 30.0
    }, 1);
    stepTick(w30, neutralInput());
    expect(w30.lanterns[0].fuelTicks).toBe(1800);
    expect(Math.hypot(w30.shades[0].pos[0], w30.shades[0].pos[2] - 25)).toBeGreaterThanOrEqual(5.99);
  });

  it('transitions wander -> drain on weak lantern, drains 5/s, emits fuel_drain every 60 ticks, awards +15 total on Pulse, and resolves dawn_survived vs no_flames priority', () => {
    const w = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      player: { pos: [0, 0, 20.5], carried: 3, flames: 3 },
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
      shades: [{ id: 'S1', pos: [0, 1, 22.8], state: 'wander' }] // >12m away? Wait: player at 20.5 is within 12m, move player far first!
    }, 1);
    w.player.pos = [0, 0, 0]; // outside 12m so S1 wanders cleanly to L1 (weak)

    // S1 wanders to L1 and enters drain within <= 2m
    for (let i = 0; i < 20; i++) stepTick(w, neutralInput());
    expect(w.shades[0].state).toBe('drain');

    // Run 60 ticks while draining -> emits fuel_drain at drain tick 60
    let fuelDrainSeen = false;
    const fuelBefore = w.lanterns[0].fuelTicks;
    for (let i = 0; i < 60; i++) {
      const evs = stepTick(w, neutralInput());
      if (evs.some((e) => e.name === 'fuel_drain' && e.data.shade_id === 'S1' && e.data.lantern_id === 'L1')) {
        fuelDrainSeen = true;
      }
    }
    expect(fuelDrainSeen).toBe(true);
    // Drained at 1 (natural) + 5 (shade drain) = 6 ticks/tick => 360 ticks over 60 ticks
    expect(fuelBefore - w.lanterns[0].fuelTicks).toBe(360);

    // Move Mây inside 6m -> triggers drain -> chase; reset another drain shade to test Pulse +15 total score
    w.shades[0].state = 'drain';
    w.player.pos = [0, 0, 24.5];
    stepTick(w, neutralInput({ pulse: true }));
    expect(w.shades[0].state).toBe('stunned');
    expect(w.score).toBe(15); // Total +15 if shade was draining immediately before pulse!

    // Dawn win (3/5 on Night 1 -> dawn_survived + bonus 50+floor(fuel) per lit lantern + 50 per flame)
    const wDawn = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      player: { pos: [0, 0, 0], flames: 2 },
      time_left_s: 0.02, // expires after 2 ticks
      lanterns: [
        { id: 'L1', lit: true, fuel: 50.9 },
        { id: 'L2', lit: true, fuel: 40.2 },
        { id: 'L3', lit: true, fuel: 20.0 }
      ]
    }, 1);
    stepTick(wDawn, neutralInput());
    const finalEvs = stepTick(wDawn, neutralInput());
    expect(finalEvs).toContainEqual({
      type: 'event',
      tick: 2,
      name: 'game_over',
      data: { result: 'won', reason: 'dawn_survived' }
    });
    // Remaining fuels at tick 2: 50.9 - 2/60 = 50.86 (floor 50), 40.2 - 2/60 = 40.16 (floor 40), 20 - 2/60 = 19.96 (floor 19)
    // Score = (50+50) + (50+40) + (50+19) + 2*50 = 100 + 90 + 69 + 100 = 359
    expect(wDawn.score).toBe(359);

    // Losing all flames on final tick -> no_flames takes precedence over dawn_survived
    const wFinalHit = createWorld(1, {
      random_motes: false,
      random_shades: false,
      motes: [],
      player: { pos: [0, 0, 0], flames: 1 },
      shades: [{ id: 'S1', pos: [0, 1, 0.4], state: 'chase' }],
      time_left_s: 1 / 60,
      lanterns: [
        { id: 'L1', lit: true, fuel: 80 },
        { id: 'L2', lit: true, fuel: 80 },
        { id: 'L3', lit: true, fuel: 80 }
      ]
    }, 1);
    const lossEvs = stepTick(wFinalHit, neutralInput());
    expect(lossEvs).toContainEqual({
      type: 'event',
      tick: 1,
      name: 'game_over',
      data: { result: 'lost', reason: 'no_flames' }
    });
  });
});
