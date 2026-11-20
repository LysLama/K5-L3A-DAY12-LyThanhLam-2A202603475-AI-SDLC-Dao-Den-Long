export interface BenchMetricsInput {
  dtsMs: number[];
  loadMs: number;
  peakMemMb: number | null;
  vsyncOff: boolean;
  renderer: string;
  os: string;
}

export interface BenchOutput {
  contract_version: '1.3';
  avg_fps: number;
  p1_low_fps: number;
  frame_ms_p95: number;
  frames: number;
  load_ms: number;
  peak_mem_mb: number | null;
  vsync_off: boolean;
  renderer: string;
  os: string;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function computeBenchMetrics(input: BenchMetricsInput): BenchOutput {
  const sanitized = input.dtsMs
    .filter((d) => Number.isFinite(d) && d > 0)
    .map((d) => Math.max(0.05, d));

  const N = sanitized.length;
  if (N === 0) {
    return {
      contract_version: '1.3',
      avg_fps: 0,
      p1_low_fps: 0,
      frame_ms_p95: 0,
      frames: 0,
      load_ms: Math.max(0, Math.round(input.loadMs)),
      peak_mem_mb: input.peakMemMb === null ? null : Math.round(input.peakMemMb),
      vsync_off: input.vsyncOff,
      renderer: input.renderer,
      os: input.os
    };
  }

  let sumDt = 0;
  for (let i = 0; i < N; i++) sumDt += sanitized[i];
  const avgFps = (1000 * N) / sumDt;

  const sortedAsc = [...sanitized].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * N));
  let slowSum = 0;
  for (let i = N - k; i < N; i++) slowSum += sortedAsc[i];
  const p1LowFps = 1000 / (slowSum / k);

  const p95Idx = Math.min(N - 1, Math.max(0, Math.ceil(0.95 * N) - 1));
  const frameMsP95 = sortedAsc[p95Idx];

  return {
    contract_version: '1.3',
    avg_fps: round1(avgFps),
    p1_low_fps: round1(p1LowFps),
    frame_ms_p95: round1(frameMsP95),
    frames: N,
    load_ms: Math.max(0, Math.round(input.loadMs)),
    peak_mem_mb: input.peakMemMb === null ? null : Math.round(input.peakMemMb),
    vsync_off: input.vsyncOff,
    renderer: input.renderer,
    os: input.os
  };
}
