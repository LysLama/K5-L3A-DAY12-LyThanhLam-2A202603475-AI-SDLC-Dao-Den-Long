import { describe, expect, it } from 'vitest';
import { interpolatePos, unwrapAngleRad } from '../../src/client/renderMath';

describe('render interpolation & angle smoothing', () => {
  it('interpolates 3D position linearly between previous and current simulation tick', () => {
    expect(interpolatePos([0, 0, 0], [10, 2, -4], 0)).toEqual([0, 0, 0]);
    expect(interpolatePos([0, 0, 0], [10, 2, -4], 0.5)).toEqual([5, 1, -2]);
    expect(interpolatePos([0, 0, 0], [10, 2, -4], 1)).toEqual([10, 2, -4]);
    expect(interpolatePos([0, 0, 0], [10, 2, -4], 1.5)).toEqual([10, 2, -4]);
  });

  it('chooses shortest angular path across -PI/+PI wrap', () => {
    const start = Math.PI - 0.1;
    const target = -Math.PI + 0.1;
    const next = unwrapAngleRad(start, target, 0.5);
    expect(Math.abs(next)).toBeGreaterThan(3.0);
  });
});
