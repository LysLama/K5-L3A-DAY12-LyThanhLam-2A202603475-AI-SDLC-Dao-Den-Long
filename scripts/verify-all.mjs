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

function runHeadless(cli, opts) {
  const args = [
    cli,
    '--seed',
    String(opts.seed),
    '--night',
    String(opts.night ?? 1),
    '--ticks',
    String(opts.ticks),
    '--out',
    opts.out
  ];
  if (opts.scenario) args.push('--scenario', opts.scenario);
  if (opts.inputs) args.push('--inputs', opts.inputs);
  if (opts.snapshotEvery !== undefined) args.push('--snapshot-every', String(opts.snapshotEvery));
  runCommand('node', args);
  return parseJsonl(opts.out);
}

console.log('1/5 Running Vitest unit & contract suite...');
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/c', 'npx', 'vitest', 'run'], { stdio: 'inherit' });
} else {
  execFileSync('npx', ['vitest', 'run'], { stdio: 'inherit' });
}

console.log('2/5 Checking built artifacts & game.contract.json v1.1...');
assert(fs.existsSync('dist/index.html'), 'Missing dist/index.html (run npm run build)');
assert(fs.existsSync('dist-headless/cli.mjs'), 'Missing dist-headless/cli.mjs (run npm run build)');
const contract = JSON.parse(fs.readFileSync('game.contract.json', 'utf8'));
assert(contract.contract_version === '1.1', `Expected contract_version 1.1, got ${contract.contract_version}`);

const cli = path.resolve('dist-headless/cli.mjs');

console.log('3/5 Running Phase 1 regression scenarios under v1.1 normalized tuning...');
const p1Dir = path.resolve('docs/proof/phase1-scenarios');

// P1-A: Win all lit (pickup, pulse, deposit, lantern_lit, all_lit)
const winLines = runHeadless(cli, {
  seed: 101,
  night: 1,
  scenario: path.join(p1Dir, 'win-all-lit.scenario.json'),
  inputs: path.join(p1Dir, 'win-all-lit.inputs.json'),
  ticks: 300,
  snapshotEvery: 20,
  out: path.join(p1Dir, 'out-win-all-lit.jsonl')
});
const winEnd = winLines.at(-1);
assert(winEnd?.type === 'end' && winEnd?.state === 'won', `win-all-lit expected won, got ${JSON.stringify(winEnd)}`);
const winEvents = winLines.filter((l) => l.type === 'event').map((e) => e.name);
for (const expected of ['mote_picked', 'pulse', 'deposit', 'lantern_lit', 'game_over']) {
  assert(winEvents.includes(expected), `win-all-lit missing event ${expected}`);
}
console.log(`  - win-all-lit: PASS (ticks=${winEnd.ticks}, score=${winEnd.score})`);

// P1-B: Loss by no_flames
const noFlamesLines = runHeadless(cli, {
  seed: 101,
  night: 1,
  scenario: path.join(p1Dir, 'loss-no-flames.scenario.json'),
  ticks: 120,
  snapshotEvery: 10,
  out: path.join(p1Dir, 'out-loss-no-flames.jsonl')
});
const noFlamesEnd = noFlamesLines.at(-1);
const noFlamesOver = noFlamesLines.find((l) => l.type === 'event' && l.name === 'game_over');
assert(noFlamesEnd?.state === 'lost' && noFlamesOver?.data?.reason === 'no_flames', 'loss-no-flames failed');
console.log(`  - loss-no-flames: PASS (ticks=${noFlamesEnd.ticks})`);

// P1-C: Loss by dawn
const dawnLines = runHeadless(cli, {
  seed: 101,
  night: 1,
  scenario: path.join(p1Dir, 'loss-dawn.scenario.json'),
  ticks: 60,
  snapshotEvery: 10,
  out: path.join(p1Dir, 'out-loss-dawn.jsonl')
});
const dawnEnd = dawnLines.at(-1);
const dawnOver = dawnLines.find((l) => l.type === 'event' && l.name === 'game_over');
assert(dawnEnd?.state === 'lost' && dawnOver?.data?.reason === 'dawn', 'loss-dawn failed');
console.log(`  - loss-dawn: PASS (ticks=${dawnEnd.ticks})`);

// P1-D: Fall off island edge (v1.1: dropped=0, lost=4, 60-tick respawn at [0,0,0])
const fallLines = runHeadless(cli, {
  seed: 101,
  night: 1,
  scenario: path.join(p1Dir, 'fall-edge.scenario.json'),
  inputs: path.join(p1Dir, 'fall-edge.inputs.json'),
  ticks: 220,
  snapshotEvery: 20,
  out: path.join(p1Dir, 'out-fall-edge.jsonl')
});
const fallEvent = fallLines.find((l) => l.type === 'event' && l.name === 'player_hit');
const fallFinal = fallLines.filter((l) => l.type === 'snapshot').at(-1);
assert(
  fallEvent?.data?.by === 'fall' &&
    fallEvent?.data?.flames === 2 &&
    fallEvent?.data?.dropped === 0 &&
    fallEvent?.data?.lost === 4 &&
    fallFinal?.player?.pos[0] === 0 &&
    fallFinal?.player?.pos[1] === 0 &&
    fallFinal?.player?.pos[2] === 0,
  `fall-edge unexpected output: event=${JSON.stringify(fallEvent)}, finalPos=${JSON.stringify(fallFinal?.player?.pos)}`
);
console.log(`  - fall-edge: PASS (tick=${fallEvent.tick}, lost=${fallEvent.data.lost}, respawned=[0,0,0])`);

console.log('4/5 Running Phase 2 feature scenarios (Dash, Charm, Drifter, Night 2, Night 3, Pause)...');
const p2Dir = path.resolve('docs/proof/phase2-scenarios');

// P2-1: Dash (midair Y constant, cooldown respected, re-ready after 90 ticks)
const dashLines = runHeadless(cli, {
  seed: 201,
  night: 1,
  scenario: path.join(p2Dir, 'dash.scenario.json'),
  inputs: path.join(p2Dir, 'dash.inputs.json'),
  ticks: 120,
  snapshotEvery: 1,
  out: path.join(p2Dir, 'out-dash.jsonl')
});
const dashEvents = dashLines.filter((l) => l.type === 'event' && l.name === 'dash');
assert(dashEvents.length === 2, `dash expected 2 dash events (at tick ~5 and ~96), got ${dashEvents.length}`);
const dSnaps = dashLines.filter((l) => l.type === 'snapshot');
const s6 = dSnaps.find((s) => s.tick === 6);
const s12 = dSnaps.find((s) => s.tick === 12);
assert(s6 && s12 && Math.abs(s6.player.pos[1] - s12.player.pos[1]) < 1e-6, 'Midair dash failed to hold constant Y');
console.log(`  - dash: PASS (events=${dashEvents.map((e) => e.tick).join(',')}, midairY=${s6.player.pos[1]})`);

// P2-2: Bùa Gió (speed 7.2 m/s + zero dash cooldown)
const charmLines = runHeadless(cli, {
  seed: 202,
  night: 2,
  scenario: path.join(p2Dir, 'charm.scenario.json'),
  inputs: path.join(p2Dir, 'charm.inputs.json'),
  ticks: 60,
  snapshotEvery: 10,
  out: path.join(p2Dir, 'out-charm.jsonl')
});
const charmPicked = charmLines.find((l) => l.type === 'event' && l.name === 'charm_picked');
const charmDashes = charmLines.filter((l) => l.type === 'event' && l.name === 'dash');
assert(charmPicked && charmDashes.length === 2, `charm failed: picked=${Boolean(charmPicked)}, dashes=${charmDashes.length}`);
console.log(`  - charm: PASS (pickedTick=${charmPicked.tick}, backToBackDashes=${charmDashes.length})`);

// P2-3: Gió Lạc (chase -> drifter_steal -> Pulse -> drifter_drop)
const drifterLines = runHeadless(cli, {
  seed: 203,
  night: 2,
  scenario: path.join(p2Dir, 'drifter.scenario.json'),
  inputs: path.join(p2Dir, 'drifter.inputs.json'),
  ticks: 80,
  snapshotEvery: 10,
  out: path.join(p2Dir, 'out-drifter.jsonl')
});
const dSteal = drifterLines.find((l) => l.type === 'event' && l.name === 'drifter_steal');
const dDrop = drifterLines.find((l) => l.type === 'event' && l.name === 'drifter_drop');
assert(dSteal?.data?.amount === 3 && dDrop?.data?.amount === 3, `drifter failed: steal=${JSON.stringify(dSteal)}, drop=${JSON.stringify(dDrop)}`);
console.log(`  - drifter: PASS (stealTick=${dSteal.tick}, dropTick=${dDrop.tick})`);

// P2-4: Night 2 Bridge + Jump Pad + Win
const n2Lines = runHeadless(cli, {
  seed: 204,
  night: 2,
  scenario: path.join(p2Dir, 'night2-bridge-jump.scenario.json'),
  inputs: path.join(p2Dir, 'night2-bridge-jump.inputs.json'),
  ticks: 680,
  snapshotEvery: 10,
  out: path.join(p2Dir, 'out-night2-bridge-jump.jsonl')
});
const n2Snaps = n2Lines.filter((l) => l.type === 'snapshot');
const n2Air = n2Snaps.some((s) => s.player.pos[1] > 3.5);
const n2Bridge = n2Snaps.some((s) => s.player.pos[0] >= 30 && s.player.pos[0] <= 40 && s.player.pos[1] === 0);
const n2End = n2Lines.at(-1);
assert(n2Air && n2Bridge && n2End?.state === 'won', `night2 failed: air=${n2Air}, bridge=${n2Bridge}, end=${JSON.stringify(n2End)}`);
console.log(`  - night2-bridge-jump: PASS (airJump=${n2Air}, bridgeWalk=${n2Bridge}, endTick=${n2End.ticks})`);

// P2-5: Night 3 Tiers + Ramp + Bell Tower + Strong Wind
const n3Lines = runHeadless(cli, {
  seed: 205,
  night: 3,
  scenario: path.join(p2Dir, 'night3-tiers-wind.scenario.json'),
  inputs: path.join(p2Dir, 'night3-tiers-wind.inputs.json'),
  ticks: 1920,
  snapshotEvery: 20,
  out: path.join(p2Dir, 'out-night3-tiers-wind.jsonl')
});
const n3Snaps = n3Lines.filter((l) => l.type === 'snapshot');
const n3Tier1 = n3Snaps.some((s) => Math.abs(s.player.pos[1] - 3) < 0.05);
const n3Tier2 = n3Snaps.some((s) => Math.abs(s.player.pos[1] - 6) < 0.05);
const n3TowerOk = n3Snaps.every((s) => Math.hypot(s.player.pos[0], s.player.pos[2]) >= 1.999);
const n3Wind = n3Snaps.find((s) => s.wind?.active === true);
const n3WindAfter = n3Snaps.at(-1);
assert(
  n3Tier1 && n3Tier2 && n3TowerOk && Boolean(n3Wind) && n3WindAfter,
  `night3 failed: tier1=${n3Tier1}, tier2=${n3Tier2}, towerOk=${n3TowerOk}, wind=${Boolean(n3Wind)}`
);
console.log(`  - night3-tiers-wind: PASS (tier1=${n3Tier1}, tier2=${n3Tier2}, towerOk=${n3TowerOk}, windActiveTick=${n3Wind.tick})`);

// P2-6: Pause & Resume sim_tick freeze
const pauseLines = runHeadless(cli, {
  seed: 206,
  night: 1,
  scenario: path.join(p2Dir, 'pause-resume.scenario.json'),
  inputs: path.join(p2Dir, 'pause-resume.inputs.json'),
  ticks: 50,
  snapshotEvery: 5,
  out: path.join(p2Dir, 'out-pause-resume.jsonl')
});
const pPausedEv = pauseLines.find((l) => l.type === 'event' && l.name === 'paused');
const pResumedEv = pauseLines.find((l) => l.type === 'event' && l.name === 'resumed');
const pSnap15 = pauseLines.find((s) => s.type === 'snapshot' && s.tick === 15);
const pSnap25 = pauseLines.find((s) => s.type === 'snapshot' && s.tick === 25);
const pSnap45 = pauseLines.find((s) => s.type === 'snapshot' && s.tick === 45);
assert(
  pPausedEv &&
    pResumedEv &&
    pSnap15?.state === 'paused' &&
    pSnap15?.sim_tick === pSnap25?.sim_tick &&
    pSnap45 &&
    pSnap45.sim_tick > pSnap25.sim_tick,
  `pause-resume failed: snap15=${JSON.stringify(pSnap15)}, snap25=${JSON.stringify(pSnap25)}, snap45=${JSON.stringify(pSnap45)}`
);
console.log(`  - pause-resume: PASS (frozenSimTick=${pSnap15.sim_tick}, resumedSimTick=${pSnap45.sim_tick})`);

console.log('5/5 Checking Night 1-3 determinism & 21,600-tick Night 3 CLI benchmark (<= 30s)...');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-det-v11-'));
try {
  for (const night of [1, 2, 3]) {
    const det1 = path.join(tmpDir, `n${night}_1.jsonl`);
    const det2 = path.join(tmpDir, `n${night}_2.jsonl`);
    runCommand('node', [cli, '--seed', '42', '--night', String(night), '--ticks', '600', '--out', det1]);
    runCommand('node', [cli, '--seed', '42', '--night', String(night), '--ticks', '600', '--out', det2]);
    const raw1 = fs.readFileSync(det1, 'utf8');
    const raw2 = fs.readFileSync(det2, 'utf8');
    assert(raw1 === raw2, `Determinism failed for Night ${night}`);
  }
  const benchOut = path.join(tmpDir, 'bench21600.jsonl');
  const t0 = Date.now();
  runCommand('node', [cli, '--seed', '77', '--night', '3', '--ticks', '21600', '--out', benchOut]);
  const elapsedMs = Date.now() - t0;
  assert(elapsedMs <= 30000, `21,600-tick benchmark exceeded 30s: ${elapsedMs}ms`);
  console.log(`  - Night 1-3 determinism + Night 3 21,600-tick CLI benchmark: PASS (${elapsedMs}ms <= 30000ms)`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('ALL PHASE 2 VERIFICATION CHECKS PASSED.');
