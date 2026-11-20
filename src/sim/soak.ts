import { createRng } from './rng';
import { stepTick } from './step';
import type { InputState, NightId, SimState, Vec2 } from './types';
import { createWorld } from './world';

export interface SoakOptions {
  seed: number;
  nights: number;
  getRssMb: () => number;
  nowMs?: () => number;
  onCleanup?: () => void;
}

export interface SoakOutput {
  nights: number;
  crashes: number;
  results: Array<'won' | 'lost'>;
  mem_start_mb: number;
  mem_end_mb: number;
  duration_s: number;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function sampleMoveDir(rng: () => number): Vec2 {
  const dirs: Vec2[] = [
    [0, 0],
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1]
  ];
  const pick = dirs[Math.floor(rng() * dirs.length)];
  const len = Math.hypot(pick[0], pick[1]);
  return len > 1 ? [pick[0] / len, pick[1] / len] : [pick[0], pick[1]];
}

export function runSoak(options: SoakOptions): SoakOutput {
  const tStart = options.nowMs ? options.nowMs() : 0;
  const results: Array<'won' | 'lost'> = [];
  let crashes = 0;
  let memStartMb = 0;

  for (let i = 0; i < options.nights; i++) {
    const night = ((i % 3) + 1) as NightId;
    const nightSeed = options.seed + i;
    const inputRng = createRng(nightSeed ^ 0x9e3779b9);

    let state: SimState | null = null;
    try {
      state = createWorld(nightSeed, undefined, night);
      if (i === 0) {
        options.onCleanup?.();
        memStartMb = Math.round(options.getRssMb());
      }

      const maxTicks = Math.round(state.initialTimeLeftS * 60) + 120;
      let moveDir: Vec2 = sampleMoveDir(inputRng);

      for (let t = 0; t < maxTicks; t++) {
        if (t > 0 && t % 30 === 0) {
          moveDir = sampleMoveDir(inputRng);
        }
        const input: InputState = {
          move: moveDir,
          cam_yaw_deg: 0,
          jump: inputRng() < 0.05,
          dash: inputRng() < 0.03,
          pulse: inputRng() < 0.02,
          interact: inputRng() < 0.10,
          pause: false
        };
        stepTick(state, input);
        if (state.status === 'won' || state.status === 'lost') {
          break;
        }
      }

      results.push(state.status === 'won' ? 'won' : 'lost');
    } catch {
      crashes += 1;
      results.push('lost');
    } finally {
      state = null;
      options.onCleanup?.();
    }
  }

  options.onCleanup?.();
  const memEndMb = Math.round(options.getRssMb());
  const tEnd = options.nowMs ? options.nowMs() : 0;
  const durationS = Math.max(0, round1((tEnd - tStart) / 1000));

  return {
    nights: options.nights,
    crashes,
    results,
    mem_start_mb: memStartMb,
    mem_end_mb: memEndMb,
    duration_s: durationS
  };
}
