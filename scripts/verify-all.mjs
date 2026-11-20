import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function assert(cond, message) {
  if (!cond) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function runCommand(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
}

function parseJsonl(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

console.log('1/4 Running Vitest unit & contract suite...');
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/c', 'npx', 'vitest', 'run'], { stdio: 'inherit' });
} else {
  execFileSync(npxBin, ['vitest', 'run'], { stdio: 'inherit' });
}

console.log('2/4 Checking built artifacts...');
assert(fs.existsSync('dist/index.html'), 'Missing dist/index.html (run npm run build)');
assert(fs.existsSync('dist-headless/cli.mjs'), 'Missing dist-headless/cli.mjs (run npm run build)');

console.log('3/4 Running saved Phase 1 headless scenarios...');
const scenarioDir = path.resolve('docs/proof/phase1-scenarios');
const cli = path.resolve('dist-headless/cli.mjs');

// Scenario A: Full win playthrough (pickup, pulse, deposit, lantern_lit, all_lit)
const winOut = path.join(scenarioDir, 'out-win-all-lit.jsonl');
runCommand('node', [
  cli,
  '--seed',
  '101',
  '--night',
  '1',
  '--scenario',
  path.join(scenarioDir, 'win-all-lit.scenario.json'),
  '--inputs',
  path.join(scenarioDir, 'win-all-lit.inputs.json'),
  '--ticks',
  '300',
  '--out',
  winOut,
  '--snapshot-every',
  '30'
]);
const winLines = parseJsonl(winOut);
const winEnd = winLines.at(-1);
assert(winEnd?.type === 'end' && winEnd?.state === 'won', `win-all-lit expected state=won, got ${JSON.stringify(winEnd)}`);
const winEvents = winLines.filter((l) => l.type === 'event').map((e) => e.name);
for (const expected of ['mote_picked', 'pulse', 'deposit', 'lantern_lit', 'game_over']) {
  assert(winEvents.includes(expected), `win-all-lit missing event ${expected}`);
}
console.log(`  - win-all-lit: PASS (ticks=${winEnd.ticks}, score=${winEnd.score})`);

// Scenario B: Loss by no_flames
const noFlamesOut = path.join(scenarioDir, 'out-loss-no-flames.jsonl');
runCommand('node', [
  cli,
  '--seed',
  '101',
  '--night',
  '1',
  '--scenario',
  path.join(scenarioDir, 'loss-no-flames.scenario.json'),
  '--ticks',
  '120',
  '--out',
  noFlamesOut,
  '--snapshot-every',
  '10'
]);
const noFlamesLines = parseJsonl(noFlamesOut);
const noFlamesEnd = noFlamesLines.at(-1);
const noFlamesOver = noFlamesLines.find((l) => l.type === 'event' && l.name === 'game_over');
assert(noFlamesEnd?.state === 'lost' && noFlamesOver?.data?.reason === 'no_flames', 'loss-no-flames failed');
console.log(`  - loss-no-flames: PASS (ticks=${noFlamesEnd.ticks})`);

// Scenario C: Loss by dawn
const dawnOut = path.join(scenarioDir, 'out-loss-dawn.jsonl');
runCommand('node', [
  cli,
  '--seed',
  '101',
  '--night',
  '1',
  '--scenario',
  path.join(scenarioDir, 'loss-dawn.scenario.json'),
  '--ticks',
  '60',
  '--out',
  dawnOut,
  '--snapshot-every',
  '10'
]);
const dawnLines = parseJsonl(dawnOut);
const dawnEnd = dawnLines.at(-1);
const dawnOver = dawnLines.find((l) => l.type === 'event' && l.name === 'game_over');
assert(dawnEnd?.state === 'lost' && dawnOver?.data?.reason === 'dawn', 'loss-dawn failed');
console.log(`  - loss-dawn: PASS (ticks=${dawnEnd.ticks})`);

// Scenario D: Fall off island edge
const fallOut = path.join(scenarioDir, 'out-fall-edge.jsonl');
runCommand('node', [
  cli,
  '--seed',
  '101',
  '--night',
  '1',
  '--scenario',
  path.join(scenarioDir, 'fall-edge.scenario.json'),
  '--inputs',
  path.join(scenarioDir, 'fall-edge.inputs.json'),
  '--ticks',
  '120',
  '--out',
  fallOut,
  '--snapshot-every',
  '20'
]);
const fallLines = parseJsonl(fallOut);
const fallEvent = fallLines.find((l) => l.type === 'event' && l.name === 'player_hit');
assert(
  fallEvent?.data?.by === 'fall' && fallEvent?.data?.flames === 2 && fallEvent?.data?.dropped === 2,
  `fall-edge unexpected event: ${JSON.stringify(fallEvent)}`
);
console.log(`  - fall-edge: PASS (tick=${fallEvent.tick}, dropped=${fallEvent.data.dropped})`);

console.log('4/4 Checking two-run byte-for-byte determinism (seed=42, ticks=600)...');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-det-'));
try {
  const det1 = path.join(tmpDir, 'det1.jsonl');
  const det2 = path.join(tmpDir, 'det2.jsonl');
  runCommand('node', [cli, '--seed', '42', '--night', '1', '--ticks', '600', '--out', det1]);
  runCommand('node', [cli, '--seed', '42', '--night', '1', '--ticks', '600', '--out', det2]);
  const raw1 = fs.readFileSync(det1, 'utf8');
  const raw2 = fs.readFileSync(det2, 'utf8');
  assert(raw1 === raw2, 'Determinism check failed: two identical seed=42 runs differed');
  console.log(`  - determinism: PASS (${raw1.length} bytes identical)`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('ALL VERIFICATION CHECKS PASSED.');
