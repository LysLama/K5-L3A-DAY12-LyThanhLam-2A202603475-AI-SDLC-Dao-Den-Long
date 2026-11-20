import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { runSoak } from '../sim/soak';
import { stepTick } from '../sim/step';
import type { InputState } from '../sim/types';
import { createWorld } from '../sim/world';

function parseIntFlag(raw: string | undefined, name: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid integer for ${name}: ${raw ?? '(missing)'}`);
  }
  return Number.parseInt(raw, 10);
}

function createGcHelper(): () => void {
  try {
    v8.setFlagsFromString('--expose_gc');
    const gcFn = vm.runInNewContext('gc') as (() => void) | undefined;
    if (typeof gcFn === 'function') return gcFn;
  } catch {
    // ignore if restricted by runtime policy
  }
  return () => {};
}

function prewarmEngine(gc: () => void): void {
  // Pre-compile simulation/map geometry & V8 paths during engine boot before measuring Night 1 load RSS
  const neutral: InputState = {
    move: [1, 0],
    cam_yaw_deg: 0,
    jump: true,
    interact: true,
    pulse: true,
    dash: true,
    pause: false
  };
  for (const n of [1, 2, 3] as const) {
    let w: ReturnType<typeof createWorld> | null = createWorld(1, undefined, n);
    for (let t = 0; t < 2000; t++) stepTick(w, neutral);
    w = null;
  }
  gc();
}

function main(): void {
  const argv = process.argv.slice(2);
  let seed = 7;
  let nights = 10;
  let out = '';

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--seed') {
      seed = parseIntFlag(argv[++i], '--seed');
    } else if (flag === '--nights') {
      nights = parseIntFlag(argv[++i], '--nights');
    } else if (flag === '--out') {
      out = argv[++i] ?? '';
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (!out) throw new Error('Missing required --out <soak.json>');
  if (nights <= 0) throw new Error(`--nights must be > 0, got ${nights}`);

  const gc = createGcHelper();
  prewarmEngine(gc);

  const result = runSoak({
    seed,
    nights,
    getRssMb: () => process.memoryUsage().rss / (1024 * 1024),
    nowMs: () => performance.now(),
    onCleanup: gc
  });

  const outPath = path.resolve(out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(
    `Soak complete (${result.nights} nights, crashes=${result.crashes}, mem ${result.mem_start_mb}->${result.mem_end_mb} MB in ${result.duration_s}s)`
  );
  if (result.crashes > 0 || result.mem_end_mb > result.mem_start_mb * 1.2) {
    process.exit(1);
  }
}

main();
