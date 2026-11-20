import type { Vec3 } from '../sim/types';

export function interpolatePos(prev: Vec3, curr: Vec3, alpha: number): Vec3 {
  const t = Math.max(0, Math.min(1, alpha));
  return [
    prev[0] + (curr[0] - prev[0]) * t,
    prev[1] + (curr[1] - prev[1]) * t,
    prev[2] + (curr[2] - prev[2]) * t
  ];
}

export function unwrapAngleRad(current: number, target: number, factor: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.max(0, Math.min(1, factor));
}
