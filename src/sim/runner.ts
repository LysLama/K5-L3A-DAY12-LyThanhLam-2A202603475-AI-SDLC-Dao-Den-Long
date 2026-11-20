import type { InputFrame, InputState, NightId, ScenarioConfig, SimEnd } from './types';
import { stepTick } from './step';
import { buildSnapshot, createWorld } from './world';

export interface RunSimulationOptions {
  seed: number;
  night?: NightId;
  ticks: number;
  snapshotEvery: number;
  scenario?: ScenarioConfig;
  frames?: InputFrame[];
  emitNightStart?: boolean;
}

export function runSimulation(opts: RunSimulationOptions): string[] {
  const night: NightId = opts.night ?? 1;
  const state = createWorld(opts.seed, opts.scenario, night);
  const lines: string[] = [];

  lines.push(JSON.stringify(buildSnapshot(state)));
  if (opts.emitNightStart) {
    lines.push(JSON.stringify({ type: 'event', tick: 0, name: 'night_start', data: { night } }));
  }

  const frames = opts.frames ?? [];
  let frameIdx = 0;

  const input: InputState = {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false
  };

  for (let k = 0; k < opts.ticks; k++) {
    while (frameIdx < frames.length && frames[frameIdx].tick < k) {
      frameIdx += 1;
    }
    if (frameIdx < frames.length && frames[frameIdx].tick === k) {
      const f = frames[frameIdx];
      if (f.move !== undefined) input.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) input.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) input.jump = f.jump;
      if (f.interact !== undefined) input.interact = f.interact;
      if (f.pulse !== undefined) input.pulse = f.pulse;
      if (f.dash !== undefined) input.dash = f.dash;
      if (f.pause !== undefined) input.pause = f.pause;
      frameIdx += 1;
    }

    const events = stepTick(state, input);
    for (const ev of events) {
      lines.push(JSON.stringify(ev));
    }

    if (state.tick % opts.snapshotEvery === 0) {
      lines.push(JSON.stringify(buildSnapshot(state)));
    }

    if (state.status === 'won' || state.status === 'lost') {
      break;
    }
  }

  const endLine: SimEnd = {
    type: 'end',
    ticks: state.simTick,
    state: state.status,
    score: state.score
  };
  lines.push(JSON.stringify(endLine));

  return lines;
}
