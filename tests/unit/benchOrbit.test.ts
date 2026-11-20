import { describe, expect, it } from 'vitest';
import { computeBenchCameraPosition } from '../../src/client/benchOrbit';

describe('bench camera circular CCW orbit (TICKET-04)', () => {
  it('starts at (30, 15, 0) at angle 0 and moves counter-clockwise viewed from +Y every 15s', () => {
    const p0 = computeBenchCameraPosition(0);
    expect(p0[0]).toBeCloseTo(30, 5);
    expect(p0[1]).toBe(15);
    expect(p0[2]).toBeCloseTo(0, 5);

    // 1/4 orbit = 3.75s -> 90 deg CCW from +X looking down from +Y points along -Z: (0, 15, -30)
    const pQuarter = computeBenchCameraPosition(3.75);
    expect(pQuarter[0]).toBeCloseTo(0, 5);
    expect(pQuarter[1]).toBe(15);
    expect(pQuarter[2]).toBeCloseTo(-30, 5);

    // 1/2 orbit = 7.5s -> (-30, 15, 0)
    const pHalf = computeBenchCameraPosition(7.5);
    expect(pHalf[0]).toBeCloseTo(-30, 5);
    expect(pHalf[1]).toBe(15);
    expect(pHalf[2]).toBeCloseTo(0, 5);

    // 3/4 orbit = 11.25s -> (0, 15, 30)
    const pThreeQ = computeBenchCameraPosition(11.25);
    expect(pThreeQ[0]).toBeCloseTo(0, 5);
    expect(pThreeQ[1]).toBe(15);
    expect(pThreeQ[2]).toBeCloseTo(30, 5);

    // Full orbit = 15s -> returns to (30, 15, 0)
    const pFull = computeBenchCameraPosition(15);
    expect(pFull[0]).toBeCloseTo(30, 5);
    expect(pFull[1]).toBe(15);
    expect(pFull[2]).toBeCloseTo(0, 5);
  });
});
