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

console.log('1/7 Running Vitest unit & contract suite...');
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/c', 'npx', 'vitest', 'run'], { stdio: 'inherit' });
} else {
  execFileSync('npx', ['vitest', 'run'], { stdio: 'inherit' });
}

console.log('2/7 Checking built artifacts & game.contract.json v1.3...');
assert(fs.existsSync('dist/index.html'), 'Missing dist/index.html (run npm run build)');
assert(fs.existsSync('dist-headless/cli.mjs'), 'Missing dist-headless/cli.mjs (run npm run build)');
assert(fs.existsSync('dist-app/run.mjs'), 'Missing dist-app/run.mjs (run npm run build)');
assert(fs.existsSync('dist-app/bench.mjs'), 'Missing dist-app/bench.mjs (run npm run build)');
assert(fs.existsSync('dist-app/soak.mjs'), 'Missing dist-app/soak.mjs (run npm run build)');
const contract = JSON.parse(fs.readFileSync('game.contract.json', 'utf8'));
assert(contract.contract_version === '1.3', `Expected contract_version 1.3, got ${contract.contract_version}`);

const cli = path.resolve('dist-headless/cli.mjs');

console.log('3/7 Running Phase 1 regression scenarios under v1.3 rules...');
const p1Dir = path.resolve('docs/proof/phase1-scenarios');

// P1-A: Win at dawn (pickup, pulse, deposit, lantern_lit, dawn_survived)
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
const winOver = winLines.find((l) => l.type === 'event' && l.name === 'game_over');
assert(
  winEnd?.type === 'end' && winEnd?.state === 'won' && winOver?.data?.reason === 'dawn_survived',
  `win-all-lit expected won/dawn_survived, got end=${JSON.stringify(winEnd)}, over=${JSON.stringify(winOver)}`
);
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

console.log('4/7 Running Phase 2 feature scenarios under v1.3 (Dash, Charm, Drifter, Night 2, Night 3, Pause)...');
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

console.log('5/7 Running Phase 3 Contract v1.3 scenarios (Fuel, Drain+Pulse, Dawn Survived, Capacity Scaling)...');
const p3Dir = path.resolve('docs/proof/phase3-scenarios');

// P3-1: Fuel decay -> lantern_out -> relight (5 motes) + refuel (skipping 100-fuel L2)
const p3FuelLines = runHeadless(cli, {
  seed: 301,
  night: 1,
  scenario: path.join(p3Dir, 'fuel-refuel-relight.scenario.json'),
  inputs: path.join(p3Dir, 'fuel-refuel-relight.inputs.json'),
  ticks: 80,
  snapshotEvery: 10,
  out: path.join(p3Dir, 'out-fuel-refuel-relight.jsonl')
});
const p3Refuel = p3FuelLines.find((l) => l.type === 'event' && l.name === 'refuel');
const p3Out = p3FuelLines.find((l) => l.type === 'event' && l.name === 'lantern_out');
const p3Relit = p3FuelLines.find((l) => l.type === 'event' && l.name === 'lantern_lit');
assert(
  p3Refuel?.data?.lantern_id === 'L3' &&
    p3Refuel?.data?.amount === 2 &&
    p3Refuel?.data?.fuel === 100 &&
    p3Out?.data?.lantern_id === 'L1' &&
    p3Relit?.data?.lantern_id === 'L1' &&
    p3Relit?.data?.relight === true,
  `fuel-refuel-relight failed: refuel=${JSON.stringify(p3Refuel)}, out=${JSON.stringify(p3Out)}, relit=${JSON.stringify(p3Relit)}`
);
console.log(
  `  - fuel-refuel-relight: PASS (refuel=L3 +${p3Refuel.data.amount}motes->100, out=L1@t${p3Out.tick}, relit=L1@t${p3Relit.tick})`
);

// P3-2: Shade wander->drain -> fuel_drain (60 ticks), +15 stun on drain Shade, refuel >= 30 pushes Shade out
const p3DrainLines = runHeadless(cli, {
  seed: 302,
  night: 1,
  scenario: path.join(p3Dir, 'shade-drain-pulse.scenario.json'),
  inputs: path.join(p3Dir, 'shade-drain-pulse.inputs.json'),
  ticks: 215,
  snapshotEvery: 10,
  out: path.join(p3Dir, 'out-shade-drain-pulse.jsonl')
});
const p3PulseSnap = p3DrainLines.find((l) => l.type === 'snapshot' && l.tick === 10);
const p3FuelDrain = p3DrainLines.find((l) => l.type === 'event' && l.name === 'fuel_drain');
const p3DrainRefuel = p3DrainLines.find((l) => l.type === 'event' && l.name === 'refuel');
const p3FinalSnap = p3DrainLines.filter((l) => l.type === 'snapshot').at(-1);
const s1Final = p3FinalSnap?.shades?.find((s) => s.id === 'S1');
const s1DistToL2 = s1Final ? Math.hypot(s1Final.pos[0], s1Final.pos[2]) : 0;
assert(
  p3DrainLines.some((l) => l.type === 'event' && l.name === 'pulse' && l.data?.stunned_ids?.includes('S2')) &&
    p3PulseSnap?.score === 15 &&
    p3FuelDrain?.data?.lantern_id === 'L2' &&
    p3FuelDrain?.data?.shade_id === 'S1' &&
    p3DrainRefuel?.data?.lantern_id === 'L2' &&
    p3DrainRefuel?.data?.fuel >= 30 &&
    s1DistToL2 >= 5.95,
  `shade-drain-pulse failed: snap10=${JSON.stringify(p3PulseSnap)}, drain=${JSON.stringify(p3FuelDrain)}, refuel=${JSON.stringify(p3DrainRefuel)}, s1Dist=${s1DistToL2}`
);
console.log(
  `  - shade-drain-pulse: PASS (drainStunScore=${p3PulseSnap.score}, fuel_drain@t${p3FuelDrain.tick}, safePushDist=${s1DistToL2.toFixed(2)}m)`
);

// P3-3: Dawn survival threshold (3/5 Night 1 -> dawn_survived exact score 537)
const p3DawnLines = runHeadless(cli, {
  seed: 303,
  night: 1,
  scenario: path.join(p3Dir, 'dawn-survived-threshold.scenario.json'),
  ticks: 80,
  snapshotEvery: 20,
  out: path.join(p3Dir, 'out-dawn-survived-threshold.jsonl')
});
const p3DawnEnd = p3DawnLines.at(-1);
const p3DawnOver = p3DawnLines.find((l) => l.type === 'event' && l.name === 'game_over');
assert(
  p3DawnEnd?.type === 'end' &&
    p3DawnEnd?.state === 'won' &&
    p3DawnOver?.data?.reason === 'dawn_survived' &&
    p3DawnEnd?.score === 537,
  `dawn-survived-threshold failed: end=${JSON.stringify(p3DawnEnd)}, over=${JSON.stringify(p3DawnOver)}`
);
console.log(`  - dawn-survived-threshold: PASS (reason=dawn_survived, score=${p3DawnEnd.score})`);

// P3-4: Dynamic capacity scaling (10 -> 12 after 1 lit lantern, caps at 12 motes out of 13)
const p3CapLines = runHeadless(cli, {
  seed: 304,
  night: 1,
  scenario: path.join(p3Dir, 'capacity-scaling.scenario.json'),
  inputs: path.join(p3Dir, 'capacity-scaling.inputs.json'),
  ticks: 180,
  snapshotEvery: 20,
  out: path.join(p3Dir, 'out-capacity-scaling.jsonl')
});
const p3CapFinal = p3CapLines.filter((l) => l.type === 'snapshot').at(-1);
assert(
  p3CapFinal?.player?.capacity === 12 &&
    p3CapFinal?.player?.carried === 12 &&
    p3CapFinal?.motes?.length === 1,
  `capacity-scaling failed: final=${JSON.stringify(p3CapFinal?.player)}, remainingMotes=${p3CapFinal?.motes?.length}`
);
console.log(
  `  - capacity-scaling: PASS (capacity=${p3CapFinal.player.capacity}, carried=${p3CapFinal.player.carried}, leftoverMotes=${p3CapFinal.motes.length})`
);

console.log('6/7 Checking Night 1-3 determinism & 21,600-tick Night 3 CLI benchmark (<= 30s)...');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-det-v13-'));
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
  const benchScenario = path.join(tmpDir, 'bench.scenario.json');
  fs.writeFileSync(
    benchScenario,
    JSON.stringify({ player: { pos: [0, 6, 4], flames: 999 }, wind_enabled: true, time_left_s: 360 })
  );
  const benchOut = path.join(tmpDir, 'bench21600.jsonl');
  const t0 = Date.now();
  const benchLines = runHeadless(cli, {
    seed: 77,
    night: 3,
    scenario: benchScenario,
    ticks: 21600,
    out: benchOut
  });
  const elapsedMs = Date.now() - t0;
  const benchEnd = benchLines.at(-1);
  assert(
    benchEnd?.type === 'end' && benchEnd.ticks === 21600,
    `21,600-tick benchmark terminated early: ${JSON.stringify(benchEnd)}`
  );
  assert(elapsedMs <= 30000, `21,600-tick benchmark exceeded 30s: ${elapsedMs}ms`);
  console.log(
    `  - Night 1-3 determinism + Night 3 21,600-tick CLI benchmark: PASS (${benchEnd.ticks} ticks in ${elapsedMs}ms <= 30000ms)`
  );

  console.log('7/7 Checking Phase 4 (Contract v1.3) leaderboard export, 10-night soak & bench/soak reports...');
  const runCli = path.resolve('dist-app/run.mjs');
  const soakCli = path.resolve('dist-app/soak.mjs');

  const emptyLbFile = path.join(tmpDir, 'empty-lb.json');
  const emptyLbOut = path.join(tmpDir, 'exported-empty.json');
  runCommand('node', [runCli, '--leaderboard-file', emptyLbFile, '--export-leaderboard', emptyLbOut]);
  const exportedEmpty = JSON.parse(fs.readFileSync(emptyLbOut, 'utf8'));
  assert(
    Array.isArray(exportedEmpty.entries) && exportedEmpty.entries.length === 0,
    `Expected empty leaderboard export, got ${JSON.stringify(exportedEmpty)}`
  );

  const populatedLbFile = path.join(tmpDir, 'populated-lb.json');
  fs.writeFileSync(
    populatedLbFile,
    JSON.stringify({
      entries: [
        { name: 'May', score: 1200, nights_won: 3, achieved_at: '2026-11-20T21:00:00+07:00', seed: 42 },
        { name: 'OngDang', score: 1500, nights_won: 3, achieved_at: '2026-11-20T21:05:00+07:00', seed: 99 }
      ]
    })
  );
  const populatedLbOut = path.join(tmpDir, 'exported-populated.json');
  runCommand('node', [runCli, '--leaderboard-file', populatedLbFile, '--export-leaderboard', populatedLbOut]);
  const exportedPopulated = JSON.parse(fs.readFileSync(populatedLbOut, 'utf8'));
  assert(
    exportedPopulated.entries?.length === 2 && exportedPopulated.entries[0].name === 'OngDang',
    `Expected sorted leaderboard export, got ${JSON.stringify(exportedPopulated)}`
  );
  console.log('  - Leaderboard CLI export (empty + sorted): PASS');

  const liveSoakOut = path.join(tmpDir, 'soak-verify.json');
  runCommand('node', [soakCli, '--seed', '7', '--nights', '10', '--out', liveSoakOut]);
  const liveSoak = JSON.parse(fs.readFileSync(liveSoakOut, 'utf8'));
  assert(
    liveSoak.nights === 10 &&
      liveSoak.crashes === 0 &&
      Array.isArray(liveSoak.results) &&
      liveSoak.results.length === 10 &&
      liveSoak.mem_end_mb <= Math.max(liveSoak.mem_start_mb * 1.2, liveSoak.mem_start_mb + 15),
    `Live 10-night soak check failed: ${JSON.stringify(liveSoak)}`
  );
  console.log(
    `  - Live 10-night soak test: PASS (crashes=0, mem ${liveSoak.mem_start_mb}->${liveSoak.mem_end_mb} MB in ${liveSoak.duration_s}s)`
  );

  assert(fs.existsSync('bench.json'), 'Missing committed bench.json');
  const benchReport = JSON.parse(fs.readFileSync('bench.json', 'utf8'));
  assert(
    benchReport.contract_version === '1.3' &&
      benchReport.avg_fps >= 60 &&
      benchReport.p1_low_fps >= 30 &&
      benchReport.load_ms <= 10000,
    `Committed bench.json did not meet v1.3 thresholds: ${JSON.stringify(benchReport)}`
  );
  assert(fs.existsSync('soak.json'), 'Missing committed soak.json');
  const soakReport = JSON.parse(fs.readFileSync('soak.json', 'utf8'));
  assert(
    soakReport.nights === 10 &&
      soakReport.crashes === 0 &&
      soakReport.mem_end_mb <= soakReport.mem_start_mb * 1.2,
    `Committed soak.json did not meet v1.3 thresholds: ${JSON.stringify(soakReport)}`
  );
  console.log(
    `  - Committed bench.json & soak.json thresholds: PASS (avg_fps=${benchReport.avg_fps}, p1_low_fps=${benchReport.p1_low_fps}, load_ms=${benchReport.load_ms})`
  );
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('ALL PHASE 4 CONTRACT v1.3 VERIFICATION CHECKS PASSED.');
