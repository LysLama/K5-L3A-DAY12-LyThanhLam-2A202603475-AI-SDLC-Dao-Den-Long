import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYBINDINGS,
  detectKeyConflict,
  formatKeyCodeLabel,
  mapKeysToInput,
  type KeyAction,
  type KeyBindings
} from '../../src/client/inputMapper';
import { createWorld } from '../../src/sim/world';
import { stepTick } from '../../src/sim/step';

describe('client input mapping parity & remappable accessibility bindings', () => {
  it('maps WASD and action keys to Test Contract InputState with right-handed camera parity', () => {
    const forward = mapKeysToInput(new Set(['KeyW']), 0);
    expect(forward.move).toEqual([0, 1]);

    const right = mapKeysToInput(new Set(['KeyD']), 0);
    expect(right.move).toEqual([-1, 0]);

    const left = mapKeysToInput(new Set(['KeyA']), 0);
    expect(left.move).toEqual([1, 0]);

    const back = mapKeysToInput(new Set(['KeyS']), 0);
    expect(back.move).toEqual([0, -1]);

    const actions = mapKeysToInput(new Set(['Space', 'KeyE', 'ShiftLeft', 'KeyQ']), 90);
    expect(actions.jump).toBe(true);
    expect(actions.interact).toBe(true);
    expect(actions.dash).toBe(true);
    expect(actions.pulse).toBe(true);
    expect(actions.pause).toBe(false);
    expect(actions.cam_yaw_deg).toBe(90);

    const altActions = mapKeysToInput(new Set(['KeyF', 'KeyR', 'ShiftRight', 'KeyP']), 0);
    expect(altActions.interact).toBe(true);
    expect(altActions.pulse).toBe(true);
    expect(altActions.dash).toBe(true);
    expect(altActions.pause).toBe(true);

    const mousePulse = mapKeysToInput(new Set(), 0, true, true);
    expect(mousePulse.pulse).toBe(true);
    expect(mousePulse.dash).toBe(false);
    expect(mousePulse.pause).toBe(true);
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

  it('supports custom 9-action remappings and ShiftRight equivalence when ShiftLeft is bound', () => {
    const custom: KeyBindings = {
      ...DEFAULT_KEYBINDINGS,
      up: 'KeyI',
      down: 'KeyK',
      left: 'KeyJ',
      right: 'KeyL',
      jump: 'KeyU',
      dash: 'KeyO',
      interact: 'KeyG',
      pulse: 'KeyT',
      pause: 'KeyB'
    };

    const out = mapKeysToInput(new Set(['KeyI', 'KeyO', 'KeyG']), 0, false, false, custom);
    expect(out.move).toEqual([0, 1]);
    expect(out.dash).toBe(true);
    expect(out.interact).toBe(true);
    // Default keys W / Q should no longer trigger once rebound away
    const legacy = mapKeysToInput(new Set(['KeyW', 'KeyQ']), 0, false, false, custom);
    expect(legacy.move).toEqual([0, 0]);
    expect(legacy.pulse).toBe(false);

    // Default ShiftLeft accepts ShiftRight seamlessly
    const shiftRight = mapKeysToInput(new Set(['ShiftRight']), 0, false, false, DEFAULT_KEYBINDINGS);
    expect(shiftRight.dash).toBe(true);
  });

  it('detects duplicate key assignments across the 9 remappable actions and formats human labels', () => {
    const conflict = detectKeyConflict(DEFAULT_KEYBINDINGS, 'jump', 'KeyE');
    expect(conflict).toBe<KeyAction>('interact');

    // Rebinding an action to its own current key is NOT a conflict
    expect(detectKeyConflict(DEFAULT_KEYBINDINGS, 'jump', 'Space')).toBeNull();
    // Binding ShiftRight when dash is ShiftLeft conflicts
    expect(detectKeyConflict(DEFAULT_KEYBINDINGS, 'pulse', 'ShiftRight')).toBe<KeyAction>('dash');
    // Unassigned key like KeyZ has no conflict
    expect(detectKeyConflict(DEFAULT_KEYBINDINGS, 'jump', 'KeyZ')).toBeNull();

    expect(formatKeyCodeLabel('Space')).toBe('Space');
    expect(formatKeyCodeLabel('ShiftLeft')).toBe('Shift');
    expect(formatKeyCodeLabel('KeyE')).toBe('E');
  });
});
