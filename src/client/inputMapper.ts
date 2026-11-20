import type { InputState } from '../sim/types';

export type KeyAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'jump'
  | 'dash'
  | 'interact'
  | 'pulse'
  | 'pause';

export type KeyBindings = Record<KeyAction, string>;

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'KeyP'
};

export const KEY_ACTION_ORDER: readonly KeyAction[] = [
  'up',
  'down',
  'left',
  'right',
  'jump',
  'dash',
  'interact',
  'pulse',
  'pause'
];

export const KEY_ACTION_LABELS: Record<KeyAction, string> = {
  up: 'Tiến',
  down: 'Lùi',
  left: 'Sang trái',
  right: 'Sang phải',
  jump: 'Nhảy',
  dash: 'Lướt',
  interact: 'Nạp / Châm dầu',
  pulse: 'Tỏa Sáng',
  pause: 'Tạm dừng'
};

export function normalizeKeyForConflict(code: string): string {
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Control';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  return code;
}

export function detectKeyConflict(
  bindings: KeyBindings,
  targetAction: KeyAction,
  candidateCode: string
): KeyAction | null {
  const normCandidate = normalizeKeyForConflict(candidateCode);
  for (const action of KEY_ACTION_ORDER) {
    if (action === targetAction) continue;
    if (normalizeKeyForConflict(bindings[action]) === normCandidate) {
      return action;
    }
  }
  return null;
}

export function formatKeyCodeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  return code;
}

function isActionPressed(
  pressedKeys: ReadonlySet<string>,
  boundCode: string,
  extraCodes: readonly string[] = []
): boolean {
  if (pressedKeys.has(boundCode)) return true;
  if (boundCode === 'ShiftLeft' && pressedKeys.has('ShiftRight')) return true;
  if (boundCode === 'ShiftRight' && pressedKeys.has('ShiftLeft')) return true;
  for (const alt of extraCodes) {
    if (pressedKeys.has(alt)) return true;
  }
  return false;
}

export function mapKeysToInput(
  pressedKeys: ReadonlySet<string>,
  camYawDeg: number,
  rightMousePulse = false,
  pauseTrigger = false,
  bindings: KeyBindings = DEFAULT_KEYBINDINGS
): InputState {
  let mx = 0;
  let mz = 0;

  if (isActionPressed(pressedKeys, bindings.up)) mz += 1;
  if (isActionPressed(pressedKeys, bindings.down)) mz -= 1;
  // Right-handed Y-up: with forward = (sin θ, 0, cos θ), screen-right = (-cos θ, 0, sin θ) => move[-1, 0]
  if (isActionPressed(pressedKeys, bindings.right)) mx -= 1;
  if (isActionPressed(pressedKeys, bindings.left)) mx += 1;

  const extraInteract = bindings.interact === 'KeyE' ? ['KeyF'] : [];
  const extraPulse = bindings.pulse === 'KeyQ' ? ['KeyR'] : [];

  return {
    move: [mx, mz],
    cam_yaw_deg: camYawDeg,
    jump: isActionPressed(pressedKeys, bindings.jump),
    interact: isActionPressed(pressedKeys, bindings.interact, extraInteract),
    pulse: rightMousePulse || isActionPressed(pressedKeys, bindings.pulse, extraPulse),
    dash: isActionPressed(pressedKeys, bindings.dash),
    pause: pauseTrigger || pressedKeys.has('Escape') || isActionPressed(pressedKeys, bindings.pause)
  };
}
