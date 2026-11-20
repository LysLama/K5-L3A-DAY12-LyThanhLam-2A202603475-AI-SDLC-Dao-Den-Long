import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSimulation } from '../../src/sim/runner';
import { parseAndValidateInputs, parseAndValidateScenario } from '../../src/headless/validate';

const CLI_PATH = path.resolve('dist-headless/cli.mjs');
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-v11-'));
  tempDirs.push(dir);
  return dir;
}

function runCliExpectFail(args: string[]): { status: number | null; stderr: string } {
  try {
    execFileSync('node', [CLI_PATH, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number | null; stderr?: string };
    return { status: e.status ?? null, stderr: e.stderr ?? '' };
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Test Contract v1.2 headless CLI & validators', () => {
  it('exits with code 2 on malformed or Contract v1.2-invalid inputs or scenario JSON/schema', () => {
    const dir = makeTempDir();
    const out = path.join(dir, 'out.jsonl');

    const badJson = path.join(dir, 'bad.json');
    fs.writeFileSync(badJson, '{ broken json');
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--inputs', badJson, '--ticks', '10', '--out', out]).status).toBe(2);

    const dupTick = path.join(dir, 'dup.json');
    fs.writeFileSync(dupTick, JSON.stringify({ frames: [{ tick: 0 }, { tick: 0, pause: true }] }));
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--inputs', dupTick, '--ticks', '10', '--out', out]).status).toBe(2);

    const badMove = path.join(dir, 'badMove.json');
    fs.writeFileSync(badMove, JSON.stringify({ frames: [{ tick: 0, move: [1.5, 0] }] }));
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--inputs', badMove, '--ticks', '10', '--out', out]).status).toBe(2);

    const badShadeState = path.join(dir, 'badShade.json');
    fs.writeFileSync(badShadeState, JSON.stringify({ shades: [{ pos: [0, 1, 0], state: 'bogus' }] }));
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--scenario', badShadeState, '--ticks', '10', '--out', out]).status).toBe(2);

    const badFuel = path.join(dir, 'badFuel.json');
    fs.writeFileSync(badFuel, JSON.stringify({ lanterns: [{ id: 'L1', lit: true, fuel: 150 }] }));
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--scenario', badFuel, '--ticks', '10', '--out', out]).status).toBe(2);

    expect(() => parseAndValidateInputs('{"frames":[{"tick":0,"dash":true,"pause":false}]}')).not.toThrow();
    expect(() => parseAndValidateScenario('{"wind_enabled":true,"random_drifters":false,"lanterns":[{"id":"L1","lit":true,"fuel":50,"ever_lit":true}],"player":{"successful_lights":2}}')).not.toThrow();
  });

  it('supports --night 1, 2, 3 and exits with code 1 on --night 4 or missing --out', () => {
    const dir = makeTempDir();
    const out = path.join(dir, 'out.jsonl');
    expect(runCliExpectFail(['--seed', '1', '--night', '4', '--ticks', '10', '--out', out]).status).toBe(1);
    expect(runCliExpectFail(['--seed', '1', '--night', '2', '--ticks', '10']).status).toBe(1);

    for (const n of [1, 2, 3] as const) {
      const nOut = path.join(dir, `n${n}.jsonl`);
      execFileSync('node', [CLI_PATH, '--seed', '42', '--night', String(n), '--ticks', '10', '--out', nOut]);
      const lines = fs.readFileSync(nOut, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(lines[0].night).toBe(n);
      expect(lines[1]).toEqual({ type: 'event', tick: 0, name: 'night_start', data: { night: n } });
    }
  });

  it('runs Contract v1.2 lantern lighting, refuel, dawn_survived win, and pauses cleanly', () => {
    const dir = makeTempDir();
    const scenarioPath = path.join(dir, 'scenario.json');
    const inputsPath = path.join(dir, 'inputs.json');
    const outPath = path.join(dir, 'win.jsonl');

    fs.writeFileSync(
      scenarioPath,
      JSON.stringify({
        player: { pos: [0, 0, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        motes: [[0, 0, 2.5]],
        shades: [],
        lanterns: [
          { id: 'L1', pos: [0, 0, 4.5], deposited: 9, lit: false },
          { id: 'L2', lit: true, fuel: 80 },
          { id: 'L3', lit: true, fuel: 80 },
          { id: 'L4', lit: true, fuel: 80 },
          { id: 'L5', lit: true, fuel: 80 }
        ],
        time_left_s: 1.5
      })
    );
    fs.writeFileSync(
      inputsPath,
      JSON.stringify({
        frames: [
          { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
          { tick: 45, interact: true, move: [0, 0] },
          { tick: 46, interact: false }
        ]
      })
    );

    execFileSync('node', [
      CLI_PATH,
      '--seed',
      '7',
      '--night',
      '1',
      '--scenario',
      scenarioPath,
      '--inputs',
      inputsPath,
      '--ticks',
      '100',
      '--out',
      outPath,
      '--snapshot-every',
      '10'
    ]);

    const lines = fs.readFileSync(outPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[0].type).toBe('snapshot');
    expect(lines[0].player.capacity).toBe(10);
    const events = lines.filter((l) => l.type === 'event');
    expect(events.map((e) => e.name)).toEqual(['mote_picked', 'deposit', 'lantern_lit', 'game_over']);
    expect(events[2].data.relight).toBe(false);
    expect(events[3].data.reason).toBe('dawn_survived');
    expect(lines.at(-1).state).toBe('won');

    // Pause freeze check via runSimulation
    const pauseLines = runSimulation({
      seed: 1,
      night: 1,
      ticks: 20,
      snapshotEvery: 10,
      frames: [
        { tick: 2, pause: true },
        { tick: 3, pause: false },
        { tick: 15, pause: true }
      ]
    }).map((l) => JSON.parse(l));
    const snap10 = pauseLines.find((l) => l.type === 'snapshot' && l.tick === 10);
    expect(snap10.state).toBe('paused');
    expect(snap10.sim_tick).toBe(2);
  });

  it('terminates default Night 3 at exact 18,000 ticks (300s)', () => {
    const dir = makeTempDir();
    const outDef = path.join(dir, 'n3_def.jsonl');
    const defScenario = path.join(dir, 'n3_def.json');
    fs.writeFileSync(defScenario, JSON.stringify({ player: { pos: [0, 6, 4], flames: 999 } }));
    execFileSync('node', [
      CLI_PATH,
      '--seed',
      '42',
      '--night',
      '3',
      '--scenario',
      defScenario,
      '--ticks',
      '18000',
      '--out',
      outDef,
      '--snapshot-every',
      '18000'
    ]);
    const defEnd = JSON.parse(fs.readFileSync(outDef, 'utf8').trim().split('\n').at(-1)!);
    expect(defEnd).toMatchObject({ type: 'end', ticks: 18000, state: 'lost' });
  });

  it('completes 21,600-tick Night 3 stress benchmark under 30s with 100% determinism', () => {
    const dir = makeTempDir();
    const out1 = path.join(dir, 'n3_a.jsonl');
    const out2 = path.join(dir, 'n3_b.jsonl');
    const safeScenario = path.join(dir, 'n3_safe.json');
    fs.writeFileSync(safeScenario, JSON.stringify({ player: { pos: [0, 6, 4], flames: 999 }, time_left_s: 360 }));

    const t0 = performance.now();
    execFileSync('node', [
      CLI_PATH,
      '--seed',
      '42',
      '--night',
      '3',
      '--scenario',
      safeScenario,
      '--ticks',
      '21600',
      '--out',
      out1,
      '--snapshot-every',
      '60'
    ]);
    const elapsedMs = performance.now() - t0;
    expect(elapsedMs).toBeLessThan(15000);

    execFileSync('node', [
      CLI_PATH,
      '--seed',
      '42',
      '--night',
      '3',
      '--scenario',
      safeScenario,
      '--ticks',
      '21600',
      '--out',
      out2,
      '--snapshot-every',
      '60'
    ]);
    const raw1 = fs.readFileSync(out1, 'utf8');
    expect(raw1).toBe(fs.readFileSync(out2, 'utf8'));
    const end1 = JSON.parse(raw1.trim().split('\n').at(-1)!);
    expect(end1).toMatchObject({ type: 'end', ticks: 21600 });
  }, 15000);
});
