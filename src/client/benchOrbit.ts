import type { Vec3 } from '../sim/types';

export const BENCH_ORBIT_RADIUS_M = 30;
export const BENCH_ORBIT_HEIGHT_Y = 15;
export const BENCH_ORBIT_PERIOD_S = 15;

/**
 * Computes camera position on the circular CCW bench orbit (viewed from +Y):
 * Starts at 0 deg (30, 15, 0) and orbits counter-clockwise every 15s around (0, 0, 0).
 */
export function computeBenchCameraPosition(elapsedSec: number): Vec3 {
  const angle = (2 * Math.PI * elapsedSec) / BENCH_ORBIT_PERIOD_S;
  return [
    BENCH_ORBIT_RADIUS_M * Math.cos(angle),
    BENCH_ORBIT_HEIGHT_Y,
    -BENCH_ORBIT_RADIUS_M * Math.sin(angle)
  ];
}
