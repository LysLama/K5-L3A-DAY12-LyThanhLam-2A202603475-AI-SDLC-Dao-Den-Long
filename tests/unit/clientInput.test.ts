import { describe, expect, it } from 'vitest';
import { mapKeysToInput } from '../../src/client/inputMapper';
import { createWorld } from '../../src/sim/world';
import { stepTick } from '../../src/sim/step';

describe('client input mapping parity', () => {
  it('maps WASD and action keys to Test Contract InputState with right-handed camera parity', () => {
    const forward = mapKeysToInput(new Set(['KeyW']), 0);
    expect(forward.move).toEqual([0, 1]);

    const right = mapKeysToInput(new Set(['KeyD']), 0);
    expect(right.move).toEqual([-1, 0]);

    const left = mapKeysToInput(new Set(['KeyA']), 0);
    expect(left.move).toEqual([1, 0]);

    const back = mapKeysToInput(new Set(['KeyS']), 0);
    expect(back.move).toEqual([0, -1]);

    const actions = mapKeysToInput(new Set(['Space', 'KeyE', 'ShiftLeft']), 90);
    expect(actions.jump).toBe(true);
    expect(actions.interact).toBe(true);
    expect(actions.pulse).toBe(true);
    expect(actions.cam_yaw_deg).toBe(90);

    const altActions = mapKeysToInput(new Set(['KeyF', 'KeyR']), 0);
    expect(altActions.interact).toBe(true);
    expect(altActions.pulse).toBe(true);
  });

  it('moves perpendicular to the right of camera forward when pressing D at arbitrary yaw', () => {
    const yaw = 45;
    const wWorld = createWorld(1, { random_motes: false, random_shades: false, motes: [], shades: [] });
    const dWorld = createWorld(1, { random_motes: false, random_shades: false, motes: [], shades: [] });

    stepTick(wWorld, mapKeysToInput(new Set(['KeyW']), yaw));
    stepTick(dWorld, mapKeysToInput(new Set(['KeyD']), yaw));

    const fx = wWorld.player.pos[0];
    const fz = wWorld.player.pos[2];
    const rx = dWorld.player.pos[0];
    const rz = dWorld.player.pos[2];

    // Right vector in Y-up RH coordinates equals forward x up = (-fz, fx)
    expect(rx).toBeCloseTo(-fz, 6);
    expect(rz).toBeCloseTo(fx, 6);
  });
});
