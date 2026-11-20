import {
  DEFAULT_LANTERN_POSITIONS,
  INITIAL_MOTE_COUNT,
  INITIAL_SHADE_COUNT,
  SHADE_DEFAULT_Y,
  TUNING
} from './constants';
import { createRng } from './rng';
import type {
  LanternState,
  MoteState,
  ScenarioConfig,
  ShadeState,
  SimSnapshot,
  SimState,
  Vec3
} from './types';

export function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundPos(pos: Vec3): Vec3 {
  return [round3(pos[0]), round3(pos[1]), round3(pos[2])];
}

export function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function maxNumericSuffix(ids: string[], prefix: 'M' | 'S'): number {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const id of ids) {
    const match = re.exec(id);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return max;
}

export function allocateNextId(state: SimState, prefix: 'M' | 'S'): string {
  const existing = new Set(
    prefix === 'M' ? state.motes.map((m) => m.id) : state.shades.map((s) => s.id)
  );
  let seq = prefix === 'M' ? state.nextMoteSeq : state.nextShadeSeq;
  while (existing.has(`${prefix}${seq}`)) {
    seq += 1;
  }
  if (prefix === 'M') {
    state.nextMoteSeq = seq + 1;
  } else {
    state.nextShadeSeq = seq + 1;
  }
  return `${prefix}${seq}`;
}

export function sampleMotePosition(
  rng: () => number,
  existingMotes: ReadonlyArray<{ pos: Vec3 }>,
  playerPos: Vec3
): Vec3 {
  let fallback: Vec3 = [8, 0, 8];
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = 6 + Math.sqrt(rng()) * 24; // [6, 30]
    const angle = rng() * Math.PI * 2;
    const candidate: Vec3 = [round3(r * Math.cos(angle)), 0, round3(r * Math.sin(angle))];
    if (attempt === 0) fallback = candidate;
    if (distXZ(candidate, playerPos) <= TUNING.pickup_radius + 0.5) continue;
    const tooClose = existingMotes.some((m) => distXZ(candidate, m.pos) < 2.5);
    if (!tooClose) return candidate;
  }
  return fallback;
}

export function sampleShadePosition(
  rng: () => number,
  lanterns: ReadonlyArray<LanternState>,
  playerPos: Vec3,
  minDistFromPlayer: number
): Vec3 {
  let fallback: Vec3 = [0, SHADE_DEFAULT_Y, 29];
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = 26 + rng() * 6; // [26, 32]
    const angle = rng() * Math.PI * 2;
    const candidate: Vec3 = [
      round3(r * Math.cos(angle)),
      SHADE_DEFAULT_Y,
      round3(r * Math.sin(angle))
    ];
    if (attempt === 0) fallback = candidate;
    if (distXZ(candidate, playerPos) < minDistFromPlayer) continue;
    const insideSafe = lanterns.some(
      (l) => l.lit && distXZ(candidate, l.pos) < TUNING.safe_radius
    );
    if (!insideSafe) return candidate;
  }
  return fallback;
}

export function createWorld(seed: number, scenario?: ScenarioConfig): SimState {
  const rng = createRng(seed);
  const initialTimeLeftS = scenario?.time_left_s ?? TUNING.night1_duration_s;

  const lanterns: LanternState[] = DEFAULT_LANTERN_POSITIONS.map((l) => ({
    id: l.id,
    pos: [l.pos[0], l.pos[1], l.pos[2]],
    lit: false,
    deposited: 0
  }));

  if (scenario?.lanterns) {
    for (const override of scenario.lanterns) {
      const target = lanterns.find((l) => l.id === override.id);
      if (!target) continue;
      if (override.pos) {
        target.pos = [override.pos[0], override.pos[1], override.pos[2]];
      }
      if (override.deposited !== undefined) {
        target.deposited = override.deposited;
      }
      if (override.lit !== undefined) {
        target.lit = override.lit;
        if (override.lit && override.deposited === undefined) {
          target.deposited = Math.max(target.deposited, TUNING.lantern_cost);
        }
      }
    }
  }

  const playerPos: Vec3 = scenario?.player?.pos
    ? [scenario.player.pos[0], scenario.player.pos[1], scenario.player.pos[2]]
    : [0, 0, 0];

  const randomMotes = scenario?.random_motes ?? true;
  const randomShades = scenario?.random_shades ?? true;

  const motes: MoteState[] = [];
  if (scenario?.motes !== undefined) {
    const usedMoteIds = new Set<string>();
    for (const entry of scenario.motes) {
      if (!Array.isArray(entry) && entry.id !== undefined) {
        usedMoteIds.add(entry.id);
      }
    }
    let seq = 1;
    for (const entry of scenario.motes) {
      if (Array.isArray(entry) || entry.id === undefined) {
        while (usedMoteIds.has(`M${seq}`)) seq += 1;
        const id = `M${seq++}`;
        usedMoteIds.add(id);
        const pos = Array.isArray(entry) ? entry : entry.pos;
        motes.push({ id, pos: [pos[0], pos[1], pos[2]] });
      } else {
        motes.push({ id: entry.id, pos: [entry.pos[0], entry.pos[1], entry.pos[2]] });
      }
    }
  } else if (randomMotes) {
    for (let i = 1; i <= INITIAL_MOTE_COUNT; i++) {
      const pos = sampleMotePosition(rng, motes, playerPos);
      motes.push({ id: `M${i}`, pos });
    }
  }

  const shades: ShadeState[] = [];
  if (scenario?.shades !== undefined) {
    const usedShadeIds = new Set<string>();
    for (const entry of scenario.shades) {
      if (entry.id !== undefined) {
        usedShadeIds.add(entry.id);
      }
    }
    let seq = 1;
    for (const entry of scenario.shades) {
      let id: string;
      if (entry.id === undefined) {
        while (usedShadeIds.has(`S${seq}`)) seq += 1;
        id = `S${seq++}`;
        usedShadeIds.add(id);
      } else {
        id = entry.id;
      }
      const state = entry.state ?? 'chase';
      shades.push({
        id,
        pos: [entry.pos[0], entry.pos[1], entry.pos[2]],
        state,
        stunRemaining: state === 'stunned' ? TUNING.pulse_stun_s : 0
      });
    }
  } else if (randomShades) {
    for (let i = 1; i <= INITIAL_SHADE_COUNT; i++) {
      const pos = sampleShadePosition(rng, lanterns, playerPos, 18);
      shades.push({
        id: `S${i}`,
        pos,
        state: 'chase',
        stunRemaining: 0
      });
    }
  }

  return {
    seed,
    rng,
    tick: 0,
    simTick: 0,
    status: 'playing',
    initialTimeLeftS,
    timeLeftS: initialTimeLeftS,
    score: 0,
    randomMotes,
    randomShades,
    moteSpawnTimerTicks: 0,
    shadeSpawnTimerTicks: 0,
    nextMoteSeq: maxNumericSuffix(motes.map((m) => m.id), 'M') + 1,
    nextShadeSeq: maxNumericSuffix(shades.map((s) => s.id), 'S') + 1,
    player: {
      pos: playerPos,
      vy: 0,
      facing: [0, 1],
      flames: scenario?.player?.flames ?? TUNING.flames,
      carried: scenario?.player?.carried ?? 0,
      invulnRemaining: 0,
      pulseCooldownRemaining: 0
    },
    lanterns,
    motes,
    shades,
    prevButtons: {
      jump: false,
      interact: false,
      pulse: false,
      dash: false
    }
  };
}

export function buildSnapshot(state: SimState): SimSnapshot {
  return {
    type: 'snapshot',
    tick: state.tick,
    sim_tick: state.simTick,
    state: state.status,
    time_left_s: round3(state.timeLeftS),
    score: state.score,
    player: {
      pos: roundPos(state.player.pos),
      flames: state.player.flames,
      carried: state.player.carried
    },
    lanterns: state.lanterns.map((l) => ({
      id: l.id,
      pos: roundPos(l.pos),
      lit: l.lit,
      deposited: l.deposited
    })),
    shades: state.shades.map((s) => ({
      id: s.id,
      pos: roundPos(s.pos),
      state: s.state
    })),
    motes: state.motes.map((m) => ({
      id: m.id,
      pos: roundPos(m.pos)
    })),
    motes_active: state.motes.length
  };
}
