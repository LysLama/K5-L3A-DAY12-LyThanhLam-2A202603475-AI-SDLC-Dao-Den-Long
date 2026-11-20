import type { InputState } from '../sim/types';

export function mapKeysToInput(
  pressedKeys: ReadonlySet<string>,
  camYawDeg: number,
  rightMousePulse = false
): InputState {
  let mx = 0;
  let mz = 0;

  if (pressedKeys.has('KeyW')) mz += 1;
  if (pressedKeys.has('KeyS')) mz -= 1;
  // Right-handed Y-up: with forward = (sin θ, 0, cos θ), screen-right = (-cos θ, 0, sin θ) => move[-1, 0]
  if (pressedKeys.has('KeyD')) mx -= 1;
  if (pressedKeys.has('KeyA')) mx += 1;

  return {
    move: [mx, mz],
    cam_yaw_deg: camYawDeg,
    jump: pressedKeys.has('Space'),
    interact: pressedKeys.has('KeyE') || pressedKeys.has('KeyF'),
    pulse:
      rightMousePulse ||
      pressedKeys.has('ShiftLeft') ||
      pressedKeys.has('ShiftRight') ||
      pressedKeys.has('KeyR'),
    dash: false
  };
}
