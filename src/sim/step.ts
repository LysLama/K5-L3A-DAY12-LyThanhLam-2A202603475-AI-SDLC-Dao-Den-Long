import {
  DT,
  FALL_VOID_Y,
  FOG_BOUND_RADIUS,
  GRAVITY,
  ISLAND_RADIUS,
  JUMP_VELOCITY,
  MAX_ACTIVE_MOTES,
  MAX_ACTIVE_SHADES,
  MAX_WORLD_MOTES_BUDGET,
  MOTE_RESPAWN_TICKS,
  SHADE_RESPAWN_TICKS,
  TUNING
} from './constants';
import type { InputState, LanternState, ShadeState, SimEvent, SimState, Vec2, Vec3 } from './types';
import { allocateNextId, distXZ, sampleMotePosition, sampleShadePosition } from './world';

function resolveMoveVector(move: Vec2, camYawDeg: number): Vec2 {
  let mx = Math.max(-1, Math.min(1, move[0]));
  let mz = Math.max(-1, Math.min(1, move[1]));
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const theta = (camYawDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return [mx * cosT + mz * sinT, -mx * sinT + mz * cosT];
}

function pushOutsideSafeZones(
  shade: ShadeState,
  lanterns: ReadonlyArray<LanternState>,
  playerPos: Vec3,
  allowTangent: boolean
): void {
  const safeBoundary = TUNING.safe_radius + 0.001;
  for (let pass = 0; pass < 3; pass++) {
    let adjusted = false;
    for (const lantern of lanterns) {
      if (!lantern.lit) continue;
      const dx = shade.pos[0] - lantern.pos[0];
      const dz = shade.pos[2] - lantern.pos[2];
      const dist = Math.hypot(dx, dz);
      if (dist >= TUNING.safe_radius) continue;

      adjusted = true;
      let nx = dist > 1e-6 ? dx / dist : 0;
      let nz = dist > 1e-6 ? dz / dist : 1;
      shade.pos[0] = lantern.pos[0] + nx * safeBoundary;
      shade.pos[2] = lantern.pos[2] + nz * safeBoundary;

      if (allowTangent && pass === 0) {
        const toPlayerX = playerPos[0] - lantern.pos[0];
        const toPlayerZ = playerPos[2] - lantern.pos[2];
        const cross = nx * toPlayerZ - nz * toPlayerX;
        const sign = cross >= 0 ? 1 : -1;
        const tx = -nz * sign;
        const tz = nx * sign;
        const slideStep = 0.5 * TUNING.shade_speed * DT;
        const sx = shade.pos[0] + tx * slideStep - lantern.pos[0];
        const sz = shade.pos[2] + tz * slideStep - lantern.pos[2];
        const sLen = Math.hypot(sx, sz) || 1;
        nx = sx / sLen;
        nz = sz / sLen;
        shade.pos[0] = lantern.pos[0] + nx * safeBoundary;
        shade.pos[2] = lantern.pos[2] + nz * safeBoundary;
      }
    }
    if (!adjusted) break;
  }
}

function clampShadeToFog(shade: ShadeState): void {
  const r = Math.hypot(shade.pos[0], shade.pos[2]);
  if (r > FOG_BOUND_RADIUS) {
    const scale = FOG_BOUND_RADIUS / r;
    shade.pos[0] *= scale;
    shade.pos[2] *= scale;
  }
}

function applyPlayerHit(
  state: SimState,
  by: 'shade' | 'fall',
  events: SimEvent[]
): boolean {
  const p = state.player;
  p.flames = Math.max(0, p.flames - 1);
  const dropped = Math.floor(p.carried * TUNING.hit_drop_ratio);
  p.carried -= dropped;
  p.invulnRemaining = TUNING.invuln_s;

  events.push({
    type: 'event',
    tick: state.tick,
    name: 'player_hit',
    data: { by, flames: p.flames, dropped }
  });

  if (p.flames <= 0) {
    state.status = 'lost';
    events.push({
      type: 'event',
      tick: state.tick,
      name: 'game_over',
      data: { result: 'lost', reason: 'no_flames' }
    });
    return true;
  }
  return false;
}

function sortedIds<T extends { id: string }>(items: ReadonlyArray<T>): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function stepTick(state: SimState, input: InputState): SimEvent[] {
  if (state.status !== 'playing') {
    return [];
  }

  const events: SimEvent[] = [];
  const p = state.player;

  // 1-2. Advance tick & timers
  state.simTick += 1;
  state.tick = state.simTick;
  p.invulnRemaining = Math.max(0, p.invulnRemaining - DT);
  p.pulseCooldownRemaining = Math.max(0, p.pulseCooldownRemaining - DT);
  state.timeLeftS = Math.max(0, state.initialTimeLeftS - state.simTick / 60);

  // 3. Rising-edge input detection & player movement/jump
  const jumpPressed = input.jump && !state.prevButtons.jump;
  const interactPressed = input.interact && !state.prevButtons.interact;
  const pulsePressed = input.pulse && !state.prevButtons.pulse;
  state.prevButtons = {
    jump: input.jump,
    interact: input.interact,
    pulse: input.pulse,
    dash: input.dash
  };

  const [worldX, worldZ] = resolveMoveVector(input.move, input.cam_yaw_deg);
  if (worldX !== 0 || worldZ !== 0) {
    const fLen = Math.hypot(worldX, worldZ);
    p.facing = [worldX / fLen, worldZ / fLen];
    p.pos[0] += worldX * TUNING.player_speed * DT;
    p.pos[2] += worldZ * TUNING.player_speed * DT;
  }

  const rIslandBefore = Math.hypot(p.pos[0], p.pos[2]);
  if (jumpPressed && p.pos[1] === 0 && rIslandBefore <= ISLAND_RADIUS) {
    p.vy = JUMP_VELOCITY;
  }
  if (p.pos[1] > 0 || p.vy !== 0 || rIslandBefore > ISLAND_RADIUS) {
    p.vy += GRAVITY * DT;
    p.pos[1] += p.vy * DT;
  }
  if (rIslandBefore <= ISLAND_RADIUS && p.pos[1] <= 0 && p.vy <= 0) {
    p.pos[1] = 0;
    p.vy = 0;
  }

  // 4. Fall off island check
  if (TUNING.fall_enabled && p.pos[1] <= FALL_VOID_Y) {
    p.pos = [0, 0, 0];
    p.vy = 0;
    if (applyPlayerHit(state, 'fall', events)) {
      return events;
    }
  }

  // 5. Pickup firefly motes
  if (p.carried < TUNING.carry_capacity && state.motes.length > 0) {
    const pickedIds = new Set<string>();
    for (const mote of sortedIds(state.motes)) {
      if (p.carried >= TUNING.carry_capacity) break;
      if (distXZ(p.pos, mote.pos) <= TUNING.pickup_radius) {
        pickedIds.add(mote.id);
        p.carried += 1;
        state.score += TUNING.score.per_mote;
        events.push({
          type: 'event',
          tick: state.tick,
          name: 'mote_picked',
          data: { carried: p.carried }
        });
      }
    }
    if (pickedIds.size > 0) {
      state.motes = state.motes.filter((m) => !pickedIds.has(m.id));
    }
  }

  // 6. Pulse (before shade movement/hit so a timely pulse saves the player)
  if (pulsePressed && p.pulseCooldownRemaining <= 0 && p.carried >= TUNING.pulse_cost) {
    p.carried -= TUNING.pulse_cost;
    p.pulseCooldownRemaining = TUNING.pulse_cooldown_s;
    const stunnedIds: string[] = [];

    for (const shade of sortedIds(state.shades)) {
      const dist = distXZ(p.pos, shade.pos);
      if (dist <= TUNING.pulse_radius) {
        const dx = shade.pos[0] - p.pos[0];
        const dz = shade.pos[2] - p.pos[2];
        const dirX = dist > 1e-6 ? dx / dist : 0;
        const dirZ = dist > 1e-6 ? dz / dist : 1;
        shade.pos[0] += dirX * TUNING.pulse_push_m;
        shade.pos[2] += dirZ * TUNING.pulse_push_m;
        clampShadeToFog(shade);
        pushOutsideSafeZones(shade, state.lanterns, p.pos, false);
        shade.state = 'stunned';
        shade.stunRemaining = TUNING.pulse_stun_s;
        state.score += TUNING.score.per_stun;
        stunnedIds.push(shade.id);
      }
    }

    events.push({
      type: 'event',
      tick: state.tick,
      name: 'pulse',
      data: { stunned_ids: stunnedIds }
    });
  }

  // 7. Interact / deposit into nearest unlit lantern within interact_radius
  if (interactPressed && p.carried > 0) {
    let bestLantern: LanternState | null = null;
    let bestDist = Infinity;
    for (const lantern of sortedIds(state.lanterns)) {
      if (lantern.lit) continue;
      const d = distXZ(p.pos, lantern.pos);
      if (d <= TUNING.interact_radius && d < bestDist) {
        bestDist = d;
        bestLantern = lantern;
      }
    }
    if (bestLantern) {
      const needed = TUNING.lantern_cost - bestLantern.deposited;
      const amount = Math.min(p.carried, needed);
      if (amount > 0) {
        p.carried -= amount;
        bestLantern.deposited += amount;
        events.push({
          type: 'event',
          tick: state.tick,
          name: 'deposit',
          data: {
            lantern_id: bestLantern.id,
            amount,
            deposited: bestLantern.deposited
          }
        });
        if (bestLantern.deposited >= TUNING.lantern_cost) {
          bestLantern.lit = true;
          state.score += TUNING.score.per_lantern;
          events.push({
            type: 'event',
            tick: state.tick,
            name: 'lantern_lit',
            data: { lantern_id: bestLantern.id }
          });
        }
        if (state.lanterns.every((l) => l.lit)) {
          state.score +=
            Math.floor(state.timeLeftS) * TUNING.score.per_second_left +
            p.flames * TUNING.score.per_flame_left;
          state.status = 'won';
          events.push({
            type: 'event',
            tick: state.tick,
            name: 'game_over',
            data: { result: 'won', reason: 'all_lit' }
          });
          return events;
        }
      }
    }
  }

  // 8. Periodic spawning (when random flags are enabled)
  if (state.randomShades) {
    state.shadeSpawnTimerTicks += 1;
    if (state.shadeSpawnTimerTicks >= SHADE_RESPAWN_TICKS) {
      state.shadeSpawnTimerTicks = 0;
      if (state.shades.length < MAX_ACTIVE_SHADES) {
        const id = allocateNextId(state, 'S');
        const pos = sampleShadePosition(state.rng, state.lanterns, p.pos, 14);
        state.shades.push({ id, pos, state: 'chase', stunRemaining: 0 });
        events.push({ type: 'event', tick: state.tick, name: 'shade_spawned', data: { id } });
      }
    }
  }

  if (state.randomMotes) {
    state.moteSpawnTimerTicks += 1;
    if (state.moteSpawnTimerTicks >= MOTE_RESPAWN_TICKS) {
      state.moteSpawnTimerTicks = 0;
      const depositedSum = state.lanterns.reduce((acc, l) => acc + l.deposited, 0);
      if (
        state.motes.length < MAX_ACTIVE_MOTES &&
        state.motes.length + p.carried + depositedSum < MAX_WORLD_MOTES_BUDGET
      ) {
        const id = allocateNextId(state, 'M');
        const pos = sampleMotePosition(state.rng, state.motes, p.pos);
        state.motes.push({ id, pos });
      }
    }
  }

  // 9. Shades behavior, safe_radius pushout, and contact damage
  for (const shade of sortedIds(state.shades)) {
    if (shade.state === 'stunned') {
      shade.stunRemaining -= DT;
      if (shade.stunRemaining <= 0) {
        shade.state = 'chase';
        shade.stunRemaining = 0;
      }
      continue;
    }

    const dx = p.pos[0] - shade.pos[0];
    const dz = p.pos[2] - shade.pos[2];
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-6) {
      const step = Math.min(dist, TUNING.shade_speed * DT);
      shade.pos[0] += (dx / dist) * step;
      shade.pos[2] += (dz / dist) * step;
    }

    pushOutsideSafeZones(shade, state.lanterns, p.pos, true);
    clampShadeToFog(shade);

    if (p.invulnRemaining <= 0 && distXZ(p.pos, shade.pos) <= TUNING.shade_hit_radius) {
      if (applyPlayerHit(state, 'shade', events)) {
        return events;
      }
    }
  }

  // 10. Dawn timeout check
  if (state.timeLeftS <= 0) {
    state.status = 'lost';
    events.push({
      type: 'event',
      tick: state.tick,
      name: 'game_over',
      data: { result: 'lost', reason: 'dawn' }
    });
  }

  return events;
}
