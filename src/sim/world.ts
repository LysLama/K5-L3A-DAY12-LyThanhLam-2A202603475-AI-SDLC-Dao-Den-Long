import {
  DRIFTER_FLEE_STEAL_TICKS,
  FUEL_MAX_TICKS,
  INITIAL_MOTE_COUNT,
  PULSE_STUN_TICKS,
  RECOIL_TICKS,
  SHADE_DEFAULT_Y_OFFSET,
  SHADE_SPAWNING_TICKS,
  TUNING
} from './constants';
import { getHighestGroundAt, getMapConfig } from './maps';
import { createRng } from './rng';
import type {
  CharmState,
  DrifterState,
  LanternState,
  MoteState,
  NightId,
  ScenarioConfig,
  ShadeState,
  SimSnapshot,
  SimState,
  Vec3
} from './types';

export function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function computeCapacity(successfulLights: number): number {
  return Math.min(TUNING.capacity_max, TUNING.carry_capacity + 2 * Math.max(0, successfulLights));
}

export function fuelTicksToValue(fuelTicks: number): number {
  return fuelTicks <= 0 ? 0 : round1(fuelTicks / 60);
}

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

export function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function maxNumericSuffix(ids: string[], prefix: 'M' | 'S' | 'D'): number {
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

export function allocateNextId(state: SimState, prefix: 'M' | 'S' | 'D'): string {
  const list =
    prefix === 'M' ? state.motes : prefix === 'S' ? state.shades : state.drifters;
  const existing = new Set(list.map((item) => item.id));
  let seq =
    prefix === 'M'
      ? state.nextMoteSeq
      : prefix === 'S'
        ? state.nextShadeSeq
        : state.nextDrifterSeq;
  while (existing.has(`${prefix}${seq}`)) {
    seq += 1;
  }
  if (prefix === 'M') state.nextMoteSeq = seq + 1;
  else if (prefix === 'S') state.nextShadeSeq = seq + 1;
  else state.nextDrifterSeq = seq + 1;
  return `${prefix}${seq}`;
}

function resolveUniqueIds<T extends { id?: string }>(
  items: ReadonlyArray<T>,
  prefix: 'M' | 'S' | 'D'
): string[] {
  const used = new Set<string>();
  for (const item of items) {
    if (item.id !== undefined) used.add(item.id);
  }
  let seq = 1;
  return items.map((item) => {
    if (item.id !== undefined) return item.id;
    while (used.has(`${prefix}${seq}`)) seq += 1;
    const id = `${prefix}${seq++}`;
    used.add(id);
    return id;
  });
}

export function createWorld(
  seed: number,
  scenario?: ScenarioConfig,
  night: NightId = 1
): SimState {
  const rng = createRng(seed);
  const map = getMapConfig(night);
  const initialTimeLeftS = scenario?.time_left_s ?? map.durationS;

  const lanterns: LanternState[] = map.lanterns.map((l) => ({
    id: l.id,
    pos: [l.pos[0], l.pos[1], l.pos[2]],
    lit: false,
    deposited: 0,
    fuelTicks: 0,
    everLit: false,
    relitCount: 0
  }));

  if (scenario?.lanterns) {
    for (const override of scenario.lanterns) {
      const target = lanterns.find((l) => l.id === override.id);
      if (!target) continue;
      if (override.pos) target.pos = [override.pos[0], override.pos[1], override.pos[2]];
      if (override.deposited !== undefined) target.deposited = override.deposited;
      if (override.lit !== undefined) {
        target.lit = override.lit;
        if (override.lit && override.deposited === undefined) {
          target.deposited = Math.max(target.deposited, TUNING.lantern_cost);
        }
      }
      if (override.ever_lit !== undefined) {
        target.everLit = override.ever_lit;
      } else if (target.lit) {
        target.everLit = true;
      }
      if (target.lit) {
        const fuelVal = override.fuel !== undefined ? override.fuel : TUNING.fuel_max;
        target.fuelTicks = Math.max(1, Math.min(FUEL_MAX_TICKS, Math.round(fuelVal * 60)));
        if (override.fuel !== undefined && override.fuel <= 0) {
          target.lit = false;
          target.fuelTicks = 0;
          target.deposited = 0;
        }
      } else {
        target.fuelTicks = 0;
      }
    }
  }

  const playerPos: Vec3 = scenario?.player?.pos
    ? [scenario.player.pos[0], scenario.player.pos[1], scenario.player.pos[2]]
    : [map.spawnPos[0], map.spawnPos[1], map.spawnPos[2]];

  const floorAtSpawn = getHighestGroundAt(night, playerPos[0], playerPos[2], playerPos[1]);
  const grounded = floorAtSpawn !== null && Math.abs(playerPos[1] - floorAtSpawn) <= 0.1;

  const randomMotes = scenario?.random_motes ?? true;
  const randomShades = scenario?.random_shades ?? true;
  const randomDrifters = scenario?.random_drifters ?? map.driftersEnabled;

  const motes: MoteState[] = [];
  if (scenario?.motes !== undefined) {
    const normalized = scenario.motes.map((entry) =>
      Array.isArray(entry)
        ? { pos: entry, kind: 'random' as const }
        : {
            id: entry.id,
            pos: entry.pos,
            kind: entry.kind ?? ('random' as const),
            ttl_s: entry.ttl_s
          }
    );
    const ids = resolveUniqueIds(normalized, 'M');
    normalized.forEach((item, idx) => {
      const ttlTicks =
        item.kind === 'dropped'
          ? Math.max(1, Math.round((item.ttl_s ?? 8) * 60))
          : null;
      motes.push({
        id: ids[idx],
        pos: [item.pos[0], item.pos[1], item.pos[2]],
        kind: item.kind,
        ttlTicks,
        createdTick: 0
      });
    });
  } else if (randomMotes) {
    const pool = [...map.moteSpawnPoints];
    const count = Math.min(INITIAL_MOTE_COUNT, pool.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
      const pt = pool[i];
      motes.push({
        id: `M${i + 1}`,
        pos: [pt[0], pt[1], pt[2]],
        kind: 'random',
        ttlTicks: null,
        createdTick: 0
      });
    }
  }

  const shades: ShadeState[] = [];
  if (scenario?.shades !== undefined) {
    const ids = resolveUniqueIds(scenario.shades, 'S');
    scenario.shades.forEach((entry, idx) => {
      const st = entry.state ?? 'chase';
      const defaultTicks =
        st === 'stunned'
          ? PULSE_STUN_TICKS
          : st === 'spawning'
            ? SHADE_SPAWNING_TICKS
            : st === 'recoil'
              ? RECOIL_TICKS
              : 0;
      let targetLanternId: string | null = entry.target_lantern_id ?? null;
      if (st === 'drain' && targetLanternId === null) {
        const litLanterns = lanterns.filter((l) => l.lit);
        if (litLanterns.length > 0) {
          litLanterns.sort((a, b) => distXZ(entry.pos, a.pos) - distXZ(entry.pos, b.pos));
          targetLanternId = litLanterns[0].id;
        }
      }
      shades.push({
        id: ids[idx],
        pos: [entry.pos[0], entry.pos[1], entry.pos[2]],
        state: st,
        stateTicksLeft: entry.state_ticks_left ?? defaultTicks,
        pushTicksLeft: 0,
        pushDir: [1, 0],
        recoilDir: [1, 0],
        safePushTicksLeft: 0,
        wanderDir: [1, 0],
        wanderTimerTicks: 0,
        targetLanternId,
        drainTicks: 0,
        createdTick: 0
      });
    });
  }

  const drifters: DrifterState[] = [];
  if (scenario?.drifters !== undefined) {
    const ids = resolveUniqueIds(scenario.drifters, 'D');
    scenario.drifters.forEach((entry, idx) => {
      const st = entry.state ?? 'idle';
      const stolen = entry.stolen ?? 0;
      drifters.push({
        id: ids[idx],
        pos: [entry.pos[0], entry.pos[1], entry.pos[2]],
        state: st,
        stolen,
        hasStolen: st === 'flee' && stolen > 0,
        stateTicksLeft: st === 'flee' ? DRIFTER_FLEE_STEAL_TICKS : 0,
        wanderAngle: idx * 1.7,
        createdTick: 0
      });
    });
  }

  let charms: CharmState[];
  if (scenario?.charms !== undefined) {
    charms = scenario.charms.map((c) => {
      const def = map.charms.find((d) => d.id === c.id);
      const pos: Vec3 = c.pos
        ? [c.pos[0], c.pos[1], c.pos[2]]
        : def
          ? [def.pos[0], def.pos[1], def.pos[2]]
          : [0, 0, 0];
      return {
        id: c.id,
        pos,
        available: c.available ?? true,
        respawnTicks: Math.max(0, Math.round((c.respawn_s ?? 0) * 60))
      };
    });
  } else {
    charms = map.charms.map((c) => ({
      id: c.id,
      pos: [c.pos[0], c.pos[1], c.pos[2]],
      available: true,
      respawnTicks: 0
    }));
  }

  const successfulLights = scenario?.player?.successful_lights ?? 0;

  return {
    seed,
    night,
    rng,
    tick: 0,
    simTick: 0,
    status: 'playing',
    initialTimeLeftS,
    timeLeftS: initialTimeLeftS,
    score: 0,
    randomMotes,
    randomShades,
    randomDrifters,
    initialShadeSpawned: false,
    nextShadeSpawnTick: 300,
    nextMoteSeq: maxNumericSuffix(motes.map((m) => m.id), 'M') + 1,
    nextShadeSeq: maxNumericSuffix(shades.map((s) => s.id), 'S') + 1,
    nextDrifterSeq: maxNumericSuffix(drifters.map((d) => d.id), 'D') + 1,
    playerSpawnPos: [map.spawnPos[0], map.spawnPos[1], map.spawnPos[2]],
    playerSpawnFacing: [map.spawnFacing[0], map.spawnFacing[1]],
    player: {
      pos: playerPos,
      vel: [0, 0, 0],
      grounded,
      launched: false,
      facing: [map.spawnFacing[0], map.spawnFacing[1]],
      flames: scenario?.player?.flames ?? TUNING.flames,
      carried: scenario?.player?.carried ?? 0,
      capacity: computeCapacity(successfulLights),
      successfulLights,
      invulnTicks: scenario?.player?.invuln_ticks ?? 0,
      dashTicksLeft: 0,
      dashDir: [map.spawnFacing[0], map.spawnFacing[1]],
      dashCdTicks: scenario?.player?.dash_cd_ticks ?? 0,
      pulseCdTicks: scenario?.player?.pulse_cd_ticks ?? 0,
      charmTicks: scenario?.player?.charm_ticks ?? 0,
      fallWaitTicks: 0
    },
    lanterns,
    motes,
    shades,
    drifters,
    charms,
    wind: {
      enabled: scenario?.wind_enabled ?? map.windEnabled,
      active: false,
      warning: false,
      dirDeg: 0,
      cycleTick: 0
    },
    prevButtons: {
      jump: false,
      interact: false,
      pulse: false,
      dash: false,
      pause: false
    },
    benchMode: false
  };
}

/**
 * Initializes the deterministic Contract v1.3 benchmark scene:
 * Night 1, Mây stationary at (0,0,0), L1-L3 lit (fuel 100), L4-L5 unlit,
 * 200 Shades in wander across the island, and 100 firefly motes.
 */
export function createBenchWorld(seed = 42): SimState {
  const state = createWorld(
    seed,
    {
      player: { pos: [0, 0, 0], carried: 0, flames: TUNING.flames },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
      lanterns: [
        { id: 'L1', lit: true, fuel: 100 },
        { id: 'L2', lit: true, fuel: 100 },
        { id: 'L3', lit: true, fuel: 100 },
        { id: 'L4', lit: false, deposited: 0 },
        { id: 'L5', lit: false, deposited: 0 }
      ]
    },
    1
  );

  const litLanterns = state.lanterns.filter((l) => l.lit);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // Spawn 200 wander Shades distributed evenly via sunflower spiral + seeded jitter, outside L1-L3 safe zones
  let attempt = 0;
  while (state.shades.length < 200 && attempt < 2000) {
    const idx = attempt++;
    const baseR = Math.sqrt((idx + 0.5) / 220) * 36.5 + 1.5;
    const r = Math.min(37.5, Math.max(2.5, baseR + (state.rng() - 0.5) * 1.4));
    const theta = idx * goldenAngle + (state.rng() - 0.5) * 0.25;
    const x = round3(Math.cos(theta) * r);
    const z = round3(Math.sin(theta) * r);
    const pt: Vec3 = [x, 0, z];
    if (litLanterns.some((l) => distXZ(pt, l.pos) < TUNING.safe_radius + 0.25)) continue;
    const wAngle = state.rng() * Math.PI * 2;
    state.shades.push({
      id: `S${state.shades.length + 1}`,
      pos: [x, SHADE_DEFAULT_Y_OFFSET, z],
      state: 'wander',
      stateTicksLeft: 0,
      pushTicksLeft: 0,
      pushDir: [1, 0],
      recoilDir: [1, 0],
      safePushTicksLeft: 0,
      wanderDir: [Math.cos(wAngle), Math.sin(wAngle)],
      wanderTimerTicks: 30 + Math.floor(state.rng() * 90),
      targetLanternId: null,
      drainTicks: 0,
      createdTick: 0
    });
  }

  // Spawn 100 evenly distributed fireflies (permitted above normal gameplay cap in bench)
  for (let i = 0; i < 100; i++) {
    const r = Math.min(37.5, Math.max(2.0, Math.sqrt((i + 0.5) / 100) * 37.0 + (state.rng() - 0.5) * 1.2));
    const theta = i * goldenAngle + 0.7 + (state.rng() - 0.5) * 0.2;
    state.motes.push({
      id: `M${i + 1}`,
      pos: [round3(Math.cos(theta) * r), 0, round3(Math.sin(theta) * r)],
      kind: 'random',
      ttlTicks: null,
      createdTick: 0
    });
  }

  // Pre-sort lexicographically by id so sortedIds() hits zero-allocation fast path every tick
  state.shades.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  state.motes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  state.nextShadeSeq = 201;
  state.nextMoteSeq = 101;
  state.benchMode = true;
  return state;
}

export function buildSnapshot(state: SimState): SimSnapshot {
  return {
    type: 'snapshot',
    tick: state.tick,
    sim_tick: state.simTick,
    night: state.night,
    state: state.status,
    time_left_s: round3(state.timeLeftS),
    score: state.score,
    wind: {
      active: state.wind.active,
      dir_deg: round3(state.wind.dirDeg)
    },
    player: {
      pos: roundPos(state.player.pos),
      vel: roundPos(state.player.vel),
      grounded: state.player.grounded,
      flames: state.player.flames,
      carried: state.player.carried,
      capacity: state.player.capacity,
      invuln: state.player.invulnTicks > 0,
      dash_cd_s: round3(state.player.dashCdTicks / 60),
      pulse_cd_s: round3(state.player.pulseCdTicks / 60),
      charm_s: round3(state.player.charmTicks / 60)
    },
    lanterns: state.lanterns.map((l) => ({
      id: l.id,
      pos: roundPos(l.pos),
      lit: l.lit,
      deposited: l.deposited,
      fuel: l.lit ? fuelTicksToValue(l.fuelTicks) : 0,
      ever_lit: l.everLit,
      relit_count: l.relitCount
    })),
    shades: state.shades.map((s) => ({
      id: s.id,
      pos: roundPos(s.pos),
      state: s.state
    })),
    motes: state.motes.map((m) => ({
      id: m.id,
      pos: roundPos(m.pos),
      kind: m.kind,
      ttl_s: m.ttlTicks === null ? null : round3(m.ttlTicks / 60)
    })),
    motes_active: state.motes.length,
    drifters: state.drifters.map((d) => ({
      id: d.id,
      pos: roundPos(d.pos),
      state: d.state,
      stolen: d.stolen
    })),
    charms: state.charms.map((c) => ({
      id: c.id,
      available: c.available,
      respawn_s: round3(c.respawnTicks / 60)
    }))
  };
}
