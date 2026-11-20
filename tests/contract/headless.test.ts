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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-test-'));
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

describe('Test Contract v1.0 headless CLI & validators', () => {
  it('exits with code 2 on invalid inputs or scenario JSON/schema', () => {
    const dir = makeTempDir();
    const out = path.join(dir, 'out.jsonl');

    const badJson = path.join(dir, 'bad.json');
    fs.writeFileSync(badJson, '{ broken json');
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--inputs', badJson, '--ticks', '10', '--out', out]).status).toBe(2);

    const dupTick = path.join(dir, 'dup.json');
    fs.writeFileSync(dupTick, JSON.stringify({ frames: [{ tick: 0, move: [0, 0] }, { tick: 0, jump: true }] }));
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--inputs', dupTick, '--ticks', '10', '--out', out]).status).toBe(2);

    const decTick = path.join(dir, 'dec.json');
    fs.writeFileSync(decTick, JSON.stringify({ frames: [{ tick: 5 }, { tick: 3 }] }));
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--inputs', decTick, '--ticks', '10', '--out', out]).status).toBe(2);

    const badMove = path.join(dir, 'badMove.json');
    fs.writeFileSync(badMove, JSON.stringify({ frames: [{ tick: 0, move: [1.5, 0] }] }));
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--inputs', badMove, '--ticks', '10', '--out', out]).status).toBe(2);

    const badScenario = path.join(dir, 'badScenario.json');
    fs.writeFileSync(badScenario, JSON.stringify({ player: { pos: [0, 0] } }));
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--scenario', badScenario, '--ticks', '10', '--out', out]).status).toBe(2);

    expect(() => parseAndValidateInputs('{"frames":[]}')).not.toThrow();
    expect(() => parseAndValidateScenario('{}')).not.toThrow();
  });

  it('exits with code 1 on invalid CLI args such as --night 2 or missing --out', () => {
    const dir = makeTempDir();
    const out = path.join(dir, 'out.jsonl');
    expect(runCliExpectFail(['--seed', '1', '--night', '2', '--ticks', '10', '--out', out]).status).toBe(1);
    expect(runCliExpectFail(['--seed', '1', '--night', '1', '--ticks', '10']).status).toBe(1);
  });

  it('emits tick 0 snapshot before tick 0 input, preserves sparse frame fields, and stops on win', () => {
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
          { id: 'L1', pos: [0, 0, 4.5], deposited: 3, lit: false },
          { id: 'L2', lit: true, deposited: 4 },
          { id: 'L3', lit: true, deposited: 4 },
          { id: 'L4', lit: true, deposited: 4 },
          { id: 'L5', lit: true, deposited: 4 }
        ],
        time_left_s: 100
      })
    );
    fs.writeFileSync(
      inputsPath,
      JSON.stringify({
        frames: [
          { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
          { tick: 25, interact: true },
          { tick: 26, interact: false }
        ]
      })
    );

    execFileSync(
      'node',
      [
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
        '200',
        '--out',
        outPath,
        '--snapshot-every',
        '10'
      ],
      { encoding: 'utf8' }
    );

    const lines = fs
      .readFileSync(outPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(lines[0].type).toBe('snapshot');
    expect(lines[0].tick).toBe(0);
    expect(lines[0].player.pos).toEqual([0, 0, 0]);
    expect(lines[0].motes).toEqual([{ id: 'M1', pos: [0, 0, 2.5] }]);

    const events = lines.filter((l) => l.type === 'event');
    expect(events.map((e) => e.name)).toEqual(['mote_picked', 'deposit', 'lantern_lit', 'game_over']);
    expect(events[1].tick).toBe(26); // frame tick 25 -> step 25 -> event tick 26

    const end = lines[lines.length - 1];
    expect(end.type).toBe('end');
    expect(end.state).toBe('won');
    expect(end.ticks).toBe(26);
    expect(runSimulation({ seed: 7, ticks: 200, snapshotEvery: 10 }).length).toBeGreaterThan(0);
  });

  it('produces byte-for-byte identical output across runs with the same seed and emits shade_spawned / dawn loss', () => {
    const dir = makeTempDir();
    const out1 = path.join(dir, 'run1.jsonl');
    const out2 = path.join(dir, 'run2.jsonl');

    execFileSync('node', [CLI_PATH, '--seed', '42', '--night', '1', '--ticks', '600', '--out', out1]);
    execFileSync('node', [CLI_PATH, '--seed', '42', '--night', '1', '--ticks', '600', '--out', out2]);

    const raw1 = fs.readFileSync(out1, 'utf8');
    const raw2 = fs.readFileSync(out2, 'utf8');
    expect(raw1).toBe(raw2);

    const safeScenario = path.join(dir, 'safe.json');
    const safeOut = path.join(dir, 'safe.jsonl');
    fs.writeFileSync(
      safeScenario,
      JSON.stringify({
        random_motes: false,
        random_shades: true,
        motes: [],
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, deposited: 4 }]
      })
    );
    execFileSync('node', [
      CLI_PATH,
      '--seed',
      '42',
      '--night',
      '1',
      '--scenario',
      safeScenario,
      '--ticks',
      '1510',
      '--out',
      safeOut,
      '--snapshot-every',
      '500'
    ]);
    const safeRaw = fs.readFileSync(safeOut, 'utf8');
    expect(safeRaw).toContain('"tick":1500,"name":"shade_spawned"');

    const dawnScenario = path.join(dir, 'dawn.json');
    const dawnOut = path.join(dir, 'dawn.jsonl');
    fs.writeFileSync(
      dawnScenario,
      JSON.stringify({ random_motes: false, random_shades: false, motes: [], shades: [], time_left_s: 0.1 })
    );
    execFileSync('node', [
      CLI_PATH,
      '--seed',
      '1',
      '--night',
      '1',
      '--scenario',
      dawnScenario,
      '--ticks',
      '30',
      '--out',
      dawnOut
    ]);
    const dawnLines = fs.readFileSync(dawnOut, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(dawnLines.at(-2)).toEqual({
      type: 'event',
      tick: 6,
      name: 'game_over',
      data: { result: 'lost', reason: 'dawn' }
    });
    expect(dawnLines.at(-1)).toEqual({ type: 'end', ticks: 6, state: 'lost', score: 0 });
  });
});
