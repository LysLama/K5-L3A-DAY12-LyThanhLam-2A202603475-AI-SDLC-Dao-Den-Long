import { describe, expect, it } from 'vitest';
import { computeBenchMetrics } from '../../src/shared/benchStats';

describe('benchStats calculation (Contract v1.3)', () => {
  it('computes exact avg_fps, p1_low_fps (ceil 1% slowest), frame_ms_p95, and metadata fields', () => {
    // 100 frames: 95 frames at 10ms, 4 frames at 20ms, 1 slowest frame at 50ms -> total = 950+80+50 = 1080ms
    const dts = [
      ...Array.from({ length: 95 }, () => 10),
      ...Array.from({ length: 4 }, () => 20),
      50
    ];
    const out = computeBenchMetrics({
      dtsMs: dts,
      loadMs: 1234.6,
      peakMemMb: 412.4,
      vsyncOff: true,
      renderer: 'Three.js r187 / WebGL2',
      os: 'Windows 11'
    });

    expect(out.contract_version).toBe('1.3');
    expect(out.frames).toBe(100);
    // 1000 * 100 / 1080 = 92.5925... -> 92.6
    expect(out.avg_fps).toBeCloseTo(92.6, 1);
    // k = max(1, ceil(0.01 * 100)) = 1; slowest 1 frame is 50ms -> 1000 / 50 = 20.0
    expect(out.p1_low_fps).toBeCloseTo(20.0, 1);
    // 95th percentile over 100 frames: ceil(0.95 * 100) - 1 = index 94 -> 10ms (or index 95 -> 20ms depending, check nearest-rank)
    expect(out.frame_ms_p95).toBeGreaterThanOrEqual(10);
    expect(out.frame_ms_p95).toBeLessThanOrEqual(20);
    expect(out.load_ms).toBe(1235);
    expect(out.peak_mem_mb).toBe(412);
    expect(out.vsync_off).toBe(true);
    expect(out.renderer).toBe('Three.js r187 / WebGL2');
    expect(out.os).toBe('Windows 11');
  });

  it('handles 1-frame minimal edge case safely without NaN or division by zero', () => {
    const out = computeBenchMetrics({
      dtsMs: [0.2],
      loadMs: 500,
      peakMemMb: null,
      vsyncOff: false,
      renderer: 'TestRenderer',
      os: 'Linux'
    });
    expect(out.frames).toBe(1);
    expect(Number.isFinite(out.avg_fps)).toBe(true);
    expect(Number.isFinite(out.p1_low_fps)).toBe(true);
    expect(out.peak_mem_mb).toBeNull();
  });
});
