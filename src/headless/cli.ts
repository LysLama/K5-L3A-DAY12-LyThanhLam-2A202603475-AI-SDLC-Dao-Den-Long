import fs from 'node:fs';
import path from 'node:path';
import { runSimulation } from '../sim/runner';
import type { InputFrame, NightId, ScenarioConfig } from '../sim/types';
import {
  ContractValidationError,
  parseAndValidateInputs,
  parseAndValidateScenario
} from './validate';

interface CliArgs {
  seed: number;
  night: NightId;
  ticks: number;
  out: string;
  snapshotEvery: number;
  scenario?: string;
  inputs?: string;
}

function parseIntFlag(raw: string | undefined, name: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid integer for ${name}: ${raw ?? '(missing)'}`);
  }
  return Number.parseInt(raw, 10);
}

function parseArgs(argv: string[]): CliArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      throw new Error(`Missing value for flag ${token}`);
    }
    map.set(token, val);
    i += 1;
  }

  const allowed = new Set([
    '--seed',
    '--night',
    '--scenario',
    '--inputs',
    '--ticks',
    '--out',
    '--snapshot-every'
  ]);
  for (const key of map.keys()) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown flag: ${key}`);
    }
  }

  const seed = parseIntFlag(map.get('--seed'), '--seed');
  const nightRaw = parseIntFlag(map.get('--night'), '--night');
  if (nightRaw !== 1 && nightRaw !== 2 && nightRaw !== 3) {
    throw new Error(`Unsupported night ${nightRaw}; expected 1, 2, or 3`);
  }

  const ticks = parseIntFlag(map.get('--ticks'), '--ticks');
  if (ticks < 0) {
    throw new Error(`--ticks must be >= 0, got ${ticks}`);
  }

  const out = map.get('--out');
  if (!out) {
    throw new Error('Missing required --out <file.jsonl>');
  }

  const snapshotEvery = map.has('--snapshot-every')
    ? parseIntFlag(map.get('--snapshot-every'), '--snapshot-every')
    : 10;
  if (snapshotEvery <= 0) {
    throw new Error(`--snapshot-every must be > 0, got ${snapshotEvery}`);
  }

  return {
    seed,
    night: nightRaw,
    ticks,
    out,
    snapshotEvery,
    scenario: map.get('--scenario'),
    inputs: map.get('--inputs')
  };
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));

    let scenario: ScenarioConfig | undefined;
    if (args.scenario !== undefined) {
      const rawScenario = fs.readFileSync(args.scenario, 'utf8');
      scenario = parseAndValidateScenario(rawScenario);
    }

    let frames: InputFrame[] | undefined;
    if (args.inputs !== undefined) {
      const rawInputs = fs.readFileSync(args.inputs, 'utf8');
      frames = parseAndValidateInputs(rawInputs);
    }

    const lines = runSimulation({
      seed: args.seed,
      night: args.night,
      ticks: args.ticks,
      snapshotEvery: args.snapshotEvery,
      scenario,
      frames,
      emitNightStart: args.scenario === undefined
    });

    const outDir = path.dirname(path.resolve(args.out));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(args.out, lines.join('\n') + '\n', 'utf8');
  } catch (err) {
    if (err instanceof ContractValidationError) {
      console.error(`Validation error: ${err.message}`);
      process.exit(2);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

main();
