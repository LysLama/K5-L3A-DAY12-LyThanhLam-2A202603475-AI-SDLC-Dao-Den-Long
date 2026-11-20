import {
  CHARM_DURATION_TICKS,
  CHARM_RESPAWN_TICKS,
  CHARM_SPEED,
  DASH_CD_TICKS,
  DASH_TICKS,
  DRAIN_CHASE_DIST_M,
  DRAIN_LOG_INTERVAL_TICKS,
  DRAIN_PER_TICK,
  DRAIN_RANGE_M,
  DRIFTER_AGGRO_MIN_CARRIED,
  DRIFTER_AGGRO_RADIUS,
  DRIFTER_FAST_SPEED,
  DRIFTER_FLEE_PULSE_TICKS,
  DRIFTER_FLEE_STEAL_TICKS,
  DRIFTER_IDLE_SPEED,
  DRIFTER_MAX_COUNT,
  DRIFTER_SPAWN_INTERVAL_TICKS,
  DRIFTER_STEAL_MAX,
  DRIFTER_STEAL_RADIUS,
  DROPPED_MOTE_TTL_TICKS,
  DT,
  FALL_RESPAWN_WAIT_TICKS,
  FALL_VOID_Y,
  FOG_BOUND_RADIUS,
  FUEL_DECAY_PER_TICK,
  FUEL_MAX_TICKS,
  FUEL_PER_MOTE_TICKS,
  GRAVITY,
  INVULN_TICKS,
  JUMP_VELOCITY,
  LOW_FUEL_TICKS,
  MAX_ACTIVE_MOTES,
  MOTE_RESPAWN_INTERVAL_TICKS,
  MOVE_ACCEL,
  PICKUP_MAX_DY,
  PULSE_CD_TICKS,
  PULSE_ORIGIN_Y_OFFSET,
  PULSE_PUSH_TICKS,
  PULSE_STUN_TICKS,
  RECOIL_DIST_M,
  RECOIL_TICKS,
  SAFE_PUSH_MAX_TICKS,
  SHADE_DEFAULT_Y_OFFSET,
  SHADE_DETECT_RADIUS,
  SHADE_HIT_MAX_DY,
  SHADE_LEASH_RADIUS,
  SHADE_SPAWN_MIN_PLAYER_DIST,
  SHADE_SPAWNING_TICKS,
  TUNING,
  WIND_ACTIVE_TICKS,
  WIND_CYCLE_TICKS,
  WIND_PUSH_SPEED,
  WIND_WARN_TICKS
} from './constants';
import {
  findJumpPadHit,
  getHighestGroundAt,
  getMapConfig,
  resolveMovementObstacles,
  sampleDrifterMistPoint
} from './maps';
import type {
  InputState,
  LanternState,
  NightId,
  ShadeState,
  SimEvent,
  SimState,
  Vec2,
  Vec3
} from './types';
import { allocateNextId, computeCapacity, dist3D, distXZ, fuelTicksToValue, round3 } from './world';

function sortedIds<T extends { id: string }>(items: ReadonlyArray<T>): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

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

function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

function clampToFog(pos: Vec3, night: NightId): void {
  const cx = night === 2 ? Math.max(0, Math.min(70, pos[0])) : 0;
  const dx = pos[0] - cx;
  const r = Math.hypot(dx, pos[2]);
  if (r > FOG_BOUND_RADIUS) {
    const s = FOG_BOUND_RADIUS / r;
    pos[0] = cx + dx * s;
    pos[2] *= s;
  }
}

function nearestGroundPos(night: NightId, x: number, y: number, z: number): Vec3 {
  const fy = getHighestGroundAt(night, x, z, y + 1.0);
  if (fy !== null) return [x, fy, z];
  const map = getMapConfig(night);
  let best = map.moteSpawnPoints[0];
  let bestD = Infinity;
  for (const pt of map.moteSpawnPoints) {
    const d = Math.hypot(x - pt[0], z - pt[2]);
    if (d < bestD) {
      bestD = d;
      best = pt;
    }
  }
  return [best[0], best[1], best[2]];
}

function spawnDroppedMotes(state: SimState, origin: Vec3, count: number, ringMin: number, ringMax: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + state.rng() * 0.5;
    const rad = ringMin + state.rng() * (ringMax - ringMin);
    const gx = origin[0] + Math.cos(angle) * rad;
    const gz = origin[2] + Math.sin(angle) * rad;
    const dropPos = nearestGroundPos(state.night, gx, origin[1], gz);
    const id = allocateNextId(state, 'M');
    state.motes.push({
      id,
      pos: dropPos,
      kind: 'dropped',
      ttlTicks: DROPPED_MOTE_TTL_TICKS,
      createdTick: state.simTick
    });
  }
}

function pushShadeOutOfSafeZone(
  shade: ShadeState,
  lanterns: ReadonlyArray<LanternState>,
  playerPos: Vec3,
  allowTangent: boolean
): void {
  const safeEdge = TUNING.safe_radius + 0.001;
  for (let pass = 0; pass < 3; pass++) {
    let adjusted = false;
    for (const lantern of lanterns) {
      if (!lantern.lit || lantern.fuelTicks < LOW_FUEL_TICKS) continue;
      const dx = shade.pos[0] - lantern.pos[0];
      const dz = shade.pos[2] - lantern.pos[2];
      const d = Math.hypot(dx, dz);
      if (d >= TUNING.safe_radius) continue;
      adjusted = true;
      let nx = d > 1e-6 ? dx / d : 1;
      let nz = d > 1e-6 ? dz / d : 0;

      if (shade.safePushTicksLeft > 0) {
        if (shade.safePushTicksLeft === 1) {
          shade.pos[0] = lantern.pos[0] + nx * safeEdge;
          shade.pos[2] = lantern.pos[2] + nz * safeEdge;
        } else {
          const step = (safeEdge - d) / shade.safePushTicksLeft;
          shade.pos[0] += nx * step;
          shade.pos[2] += nz * step;
        }
        continue;
      }

      shade.pos[0] = lantern.pos[0] + nx * safeEdge;
      shade.pos[2] = lantern.pos[2] + nz * safeEdge;

      if (allowTangent && pass === 0) {
        const toPx = playerPos[0] - lantern.pos[0];
        const toPz = playerPos[2] - lantern.pos[2];
        const cross = nx * toPz - nz * toPx;
        const sign = cross >= 0 ? 1 : -1;
        const tx = -nz * sign;
        const tz = nx * sign;
        const slide = 0.5 * TUNING.shade_speed * DT;
        const sx = shade.pos[0] + tx * slide - lantern.pos[0];
        const sz = shade.pos[2] + tz * slide - lantern.pos[2];
        const sLen = Math.hypot(sx, sz) || 1;
        nx = sx / sLen;
        nz = sz / sLen;
        shade.pos[0] = lantern.pos[0] + nx * safeEdge;
        shade.pos[2] = lantern.pos[2] + nz * safeEdge;
      }
    }
    if (!adjusted) break;
  }
}

export function stepTick(state: SimState, input: InputState): SimEvent[] {
  if (state.status === 'won' || state.status === 'lost') {
    return [];
  }

  const events: SimEvent[] = [];
  const p = state.player;

  // 1. Read input & handle Pause FIRST
  state.tick += 1;
  const pausePressed = input.pause && !state.prevButtons.pause;
  const jumpPressed = input.jump && !state.prevButtons.jump;
  const interactPressed = input.interact && !state.prevButtons.interact;
  const pulsePressed = input.pulse && !state.prevButtons.pulse;
  const dashPressed = input.dash && !state.prevButtons.dash;

  state.prevButtons = {
    jump: input.jump,
    interact: input.interact,
    pulse: input.pulse,
    dash: input.dash,
    pause: input.pause
  };

  if (pausePressed) {
    if (state.status === 'playing') {
      state.status = 'paused';
      events.push({ type: 'event', tick: state.tick, name: 'paused', data: {} });
      return events;
    }
    state.status = 'playing';
    events.push({ type: 'event', tick: state.tick, name: 'resumed', data: {} });
  } else if (state.status === 'paused') {
    return [];
  }

  // 2. Decrement timers, cooldowns, charm, wind, TTLs
  state.simTick += 1;
  if (!state.benchMode) {
    state.timeLeftS = Math.max(0, state.initialTimeLeftS - state.simTick / 60);
  }
  p.invulnTicks = Math.max(0, p.invulnTicks - 1);
  p.dashCdTicks = Math.max(0, p.dashCdTicks - 1);
  p.pulseCdTicks = Math.max(0, p.pulseCdTicks - 1);
  p.charmTicks = Math.max(0, p.charmTicks - 1);

  if (p.fallWaitTicks > 0) {
    p.fallWaitTicks -= 1;
    if (p.fallWaitTicks === 0) {
      p.pos = [state.playerSpawnPos[0], state.playerSpawnPos[1], state.playerSpawnPos[2]];
      p.vel = [0, 0, 0];
      p.grounded = true;
      p.launched = false;
      p.dashTicksLeft = 0;
      p.facing = [state.playerSpawnFacing[0], state.playerSpawnFacing[1]];
      p.invulnTicks = INVULN_TICKS;
    }
  }

  for (const charm of state.charms) {
    if (!charm.available && charm.respawnTicks > 0) {
      charm.respawnTicks -= 1;
      if (charm.respawnTicks === 0) charm.available = true;
    }
  }

  for (let i = state.motes.length - 1; i >= 0; i--) {
    const m = state.motes[i];
    if (m.ttlTicks !== null) {
      m.ttlTicks -= 1;
      if (m.ttlTicks <= 0) state.motes.splice(i, 1);
    }
  }

  if (state.wind.enabled) {
    const mod = state.simTick % WIND_CYCLE_TICKS;
    if (mod === WIND_CYCLE_TICKS - WIND_WARN_TICKS) {
      state.wind.warning = true;
      state.wind.dirDeg = round3(state.rng() * 360);
    }
    if (state.simTick > 0 && mod === 0) {
      state.wind.warning = false;
      state.wind.active = true;
      state.wind.cycleTick = WIND_ACTIVE_TICKS;
    } else if (state.wind.active) {
      state.wind.cycleTick -= 1;
      if (state.wind.cycleTick <= 0) {
        state.wind.active = false;
      }
    }
  }

  for (const shade of state.shades) {
    if (shade.safePushTicksLeft > 0) shade.safePushTicksLeft -= 1;
    if (shade.pushTicksLeft > 0) shade.pushTicksLeft -= 1;
    if (shade.wanderTimerTicks > 0) shade.wanderTimerTicks -= 1;
    if (shade.stateTicksLeft > 0) {
      shade.stateTicksLeft -= 1;
      if (shade.stateTicksLeft === 0) {
        if (shade.state === 'stunned') {
          shade.state = 'wander';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
        } else if (shade.state === 'spawning' || shade.state === 'recoil') {
          const d = dist3D(shade.pos, [p.pos[0], p.pos[1] + 1, p.pos[2]]);
          shade.state = d <= SHADE_DETECT_RADIUS ? 'chase' : 'wander';
        }
      }
    }
  }

  // Step 2b: Subtract natural fuel decay + drain; extinguish fuel <= 0 -> lantern_out
  if (!state.benchMode) {
    const drainingShadesByLantern = new Map<string, ShadeState[]>();
    for (const shade of sortedIds(state.shades)) {
      if (shade.state === 'drain' && shade.targetLanternId !== null) {
        const target = state.lanterns.find((l) => l.id === shade.targetLanternId);
        if (target && target.lit) {
          shade.drainTicks += 1;
          const list = drainingShadesByLantern.get(target.id);
          if (list) list.push(shade);
          else drainingShadesByLantern.set(target.id, [shade]);
        } else {
          shade.state = 'wander';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
        }
      }
    }

    for (const lantern of sortedIds(state.lanterns)) {
      if (!lantern.lit) continue;
      const drainers = drainingShadesByLantern.get(lantern.id);
      const drainAmount = drainers ? drainers.length * DRAIN_PER_TICK : 0;
      lantern.fuelTicks = Math.max(0, lantern.fuelTicks - (FUEL_DECAY_PER_TICK + drainAmount));
      const fuelValue = fuelTicksToValue(lantern.fuelTicks);

      if (drainers) {
        for (const s of drainers) {
          if (s.drainTicks % DRAIN_LOG_INTERVAL_TICKS === 0) {
            events.push({
              type: 'event',
              tick: state.tick,
              name: 'fuel_drain',
              data: { lantern_id: lantern.id, shade_id: s.id, fuel: fuelValue }
            });
          }
        }
      }

      if (lantern.fuelTicks <= 0) {
        lantern.lit = false;
        lantern.fuelTicks = 0;
        lantern.deposited = 0;
        events.push({
          type: 'event',
          tick: state.tick,
          name: 'lantern_out',
          data: { lantern_id: lantern.id }
        });
        if (drainers) {
          for (const s of drainers) {
            s.state = 'wander';
            s.targetLanternId = null;
            s.drainTicks = 0;
          }
        }
      }
    }
  }

  for (let i = state.drifters.length - 1; i >= 0; i--) {
    const d = state.drifters[i];
    if (d.state === 'flee' && d.stateTicksLeft > 0) {
      d.stateTicksLeft -= 1;
      if (d.stateTicksLeft === 0) state.drifters.splice(i, 1);
    }
  }

  // 3. Move Mây (jump, dash, jump pad, wind) & check fall
  if (p.fallWaitTicks === 0) {
    const [worldX, worldZ] = resolveMoveVector(input.move, input.cam_yaw_deg);
    if (worldX !== 0 || worldZ !== 0) {
      const fLen = Math.hypot(worldX, worldZ);
      p.facing = [worldX / fLen, worldZ / fLen];
    }

    if (dashPressed && p.dashTicksLeft === 0 && (p.dashCdTicks === 0 || p.charmTicks > 0)) {
      const dir: Vec2 =
        worldX !== 0 || worldZ !== 0
          ? [worldX / Math.hypot(worldX, worldZ), worldZ / Math.hypot(worldX, worldZ)]
          : [p.facing[0], p.facing[1]];
      p.dashDir = dir;
      p.dashTicksLeft = DASH_TICKS;
      p.dashCdTicks = p.charmTicks > 0 ? 0 : DASH_CD_TICKS;
      p.launched = false;
      p.vel[1] = 0;
      events.push({ type: 'event', tick: state.tick, name: 'dash', data: {} });
    }

    const dashingThisTick = p.dashTicksLeft > 0;
    if (dashingThisTick) {
      p.vel[0] = p.dashDir[0] * TUNING.dash_speed;
      p.vel[2] = p.dashDir[1] * TUNING.dash_speed;
      p.vel[1] = 0;
      p.dashTicksLeft -= 1;
    } else if (!p.launched) {
      const maxSpeed = p.charmTicks > 0 ? CHARM_SPEED : TUNING.player_speed;
      const accelStep = MOVE_ACCEL * DT;
      p.vel[0] = approach(p.vel[0], worldX * maxSpeed, accelStep);
      p.vel[2] = approach(p.vel[2], worldZ * maxSpeed, accelStep);
    }

    const windRad = (state.wind.dirDeg * Math.PI) / 180;
    const wx = state.wind.active ? Math.cos(windRad) * WIND_PUSH_SPEED : 0;
    const wz = state.wind.active ? Math.sin(windRad) * WIND_PUSH_SPEED : 0;

    const prevX = p.pos[0];
    const prevY = p.pos[1];
    const prevZ = p.pos[2];
    const rawX = prevX + (p.vel[0] + wx) * DT;
    const rawZ = prevZ + (p.vel[2] + wz) * DT;
    const [nextX, nextZ] = resolveMovementObstacles(state.night, prevX, prevZ, rawX, rawZ, prevY);
    p.pos[0] = nextX;
    p.pos[2] = nextZ;

    if (!dashingThisTick) {
      if (jumpPressed && p.grounded) {
        p.vel[1] = JUMP_VELOCITY;
        p.grounded = false;
      }

      const floorY = getHighestGroundAt(state.night, p.pos[0], p.pos[2], prevY);
      if (p.grounded) {
        if (floorY !== null && Math.abs(floorY - prevY) <= 0.28) {
          p.pos[1] = floorY;
          p.vel[1] = 0;
        } else {
          p.grounded = false;
          p.vel[1] += GRAVITY * DT;
          p.pos[1] += p.vel[1] * DT;
        }
      } else {
        p.vel[1] += GRAVITY * DT;
        p.pos[1] += p.vel[1] * DT;
        if (p.vel[1] <= 0 && floorY !== null && p.pos[1] <= floorY && prevY >= floorY - 0.15) {
          p.pos[1] = floorY;
          p.vel[1] = 0;
          p.grounded = true;
          p.launched = false;
        }
      }
    }

    // Check jump pad activation when grounded/touching pad
    if (p.grounded) {
      const pad = findJumpPadHit(state.night, p.pos[0], p.pos[1], p.pos[2]);
      if (pad) {
        p.vel[0] = pad.dirXZ[0] * pad.horizSpeed;
        p.vel[2] = pad.dirXZ[1] * pad.horizSpeed;
        p.vel[1] = pad.vy;
        p.grounded = false;
        p.launched = true;
        p.dashTicksLeft = 0;
      }
    }

    // Check void fall (Y < -10)
    if (TUNING.fall_enabled && p.pos[1] < FALL_VOID_Y) {
      const lost = p.carried;
      p.carried = 0;
      p.flames = Math.max(0, p.flames - 1);
      p.vel = [0, 0, 0];
      p.dashTicksLeft = 0;
      p.launched = false;
      events.push({
        type: 'event',
        tick: state.tick,
        name: 'player_hit',
        data: { by: 'fall', flames: p.flames, dropped: 0, lost }
      });
      if (p.flames > 0) {
        p.fallWaitTicks = FALL_RESPAWN_WAIT_TICKS;
      }
    }
  }

  // 4. Pickup fireflies & charms
  if (!state.benchMode && p.fallWaitTicks === 0 && p.flames > 0) {
    if (p.carried < p.capacity && state.motes.length > 0) {
      const pickedIds = new Set<string>();
      for (const mote of sortedIds(state.motes)) {
        if (p.carried >= p.capacity) break;
        if (mote.createdTick >= state.simTick) continue;
        if (
          distXZ(p.pos, mote.pos) <= TUNING.pickup_radius &&
          Math.abs(p.pos[1] - mote.pos[1]) <= PICKUP_MAX_DY
        ) {
          pickedIds.add(mote.id);
          p.carried += 1;
          events.push({ type: 'event', tick: state.tick, name: 'mote_picked', data: { carried: p.carried } });
        }
      }
      if (pickedIds.size > 0) {
        state.motes = state.motes.filter((m) => !pickedIds.has(m.id));
      }
    }

    for (const charm of state.charms) {
      if (!charm.available) continue;
      if (
        distXZ(p.pos, charm.pos) <= TUNING.pickup_radius &&
        Math.abs(p.pos[1] - charm.pos[1]) <= PICKUP_MAX_DY
      ) {
        charm.available = false;
        charm.respawnTicks = CHARM_RESPAWN_TICKS;
        p.charmTicks = CHARM_DURATION_TICKS;
        p.dashCdTicks = 0;
        events.push({
          type: 'event',
          tick: state.tick,
          name: 'charm_picked',
          data: { charm_id: charm.id, charm_ticks: CHARM_DURATION_TICKS }
        });
      }
    }
  }

  // 5. Interact with nearest receivable lantern (unlit, OR lit with fuel < 100) in 2.0 m XZ
  if (p.fallWaitTicks === 0 && p.flames > 0 && interactPressed && p.carried > 0) {
    let bestLantern: LanternState | null = null;
    let bestDist = Infinity;
    for (const lantern of sortedIds(state.lanterns)) {
      if (lantern.lit && fuelTicksToValue(lantern.fuelTicks) >= TUNING.fuel_max) continue;
      const d = distXZ(p.pos, lantern.pos);
      if (d <= TUNING.interact_radius && d < bestDist && Math.abs(p.pos[1] - lantern.pos[1]) <= 2.5) {
        bestDist = d;
        bestLantern = lantern;
      }
    }
    if (bestLantern) {
      if (!bestLantern.lit) {
        const required = bestLantern.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
        const amount = Math.min(p.carried, required - bestLantern.deposited);
        if (amount > 0) {
          p.carried -= amount;
          bestLantern.deposited += amount;
          state.score += amount * TUNING.score.per_mote;
          events.push({
            type: 'event',
            tick: state.tick,
            name: 'deposit',
            data: { lantern_id: bestLantern.id, amount, deposited: bestLantern.deposited }
          });
          if (bestLantern.deposited >= required) {
            const wasEverLit = bestLantern.everLit;
            bestLantern.lit = true;
            bestLantern.fuelTicks = FUEL_MAX_TICKS;
            bestLantern.everLit = true;
            if (wasEverLit) bestLantern.relitCount += 1;
            p.successfulLights += 1;
            p.capacity = computeCapacity(p.successfulLights);
            state.score += wasEverLit ? TUNING.score.per_relight : TUNING.score.per_lantern;
            events.push({
              type: 'event',
              tick: state.tick,
              name: 'lantern_lit',
              data: { lantern_id: bestLantern.id, relight: wasEverLit }
            });
            for (const shade of state.shades) {
              if (distXZ(shade.pos, bestLantern.pos) < TUNING.safe_radius) {
                shade.safePushTicksLeft = SAFE_PUSH_MAX_TICKS;
              }
            }
          }
        }
      } else {
        const needed = Math.ceil((FUEL_MAX_TICKS - bestLantern.fuelTicks) / FUEL_PER_MOTE_TICKS);
        const used = Math.min(p.carried, needed);
        if (used > 0) {
          const wasUnsafe = bestLantern.fuelTicks < LOW_FUEL_TICKS;
          p.carried -= used;
          bestLantern.fuelTicks = Math.min(FUEL_MAX_TICKS, bestLantern.fuelTicks + used * FUEL_PER_MOTE_TICKS);
          state.score += used * TUNING.score.per_mote;
          events.push({
            type: 'event',
            tick: state.tick,
            name: 'refuel',
            data: {
              lantern_id: bestLantern.id,
              amount: used,
              fuel: fuelTicksToValue(bestLantern.fuelTicks)
            }
          });
          if (wasUnsafe && bestLantern.fuelTicks >= LOW_FUEL_TICKS) {
            for (const shade of state.shades) {
              if (shade.state === 'drain' && shade.targetLanternId === bestLantern.id) {
                shade.state = 'wander';
                shade.targetLanternId = null;
                shade.drainTicks = 0;
              }
              if (distXZ(shade.pos, bestLantern.pos) < TUNING.safe_radius) {
                shade.safePushTicksLeft = SAFE_PUSH_MAX_TICKS;
              }
            }
          }
        }
      }
    }
  }

  // 6. Update Safe Zones (6.0 m)
  for (const shade of sortedIds(state.shades)) {
    pushShadeOutOfSafeZone(shade, state.lanterns, p.pos, false);
  }

  // 7. Pulse (Tỏa Sáng: center Y+0.8, 3D dist <= 5m, 3 motes, 3s cd)
  if (
    p.fallWaitTicks === 0 &&
    p.flames > 0 &&
    pulsePressed &&
    p.pulseCdTicks === 0 &&
    p.carried >= TUNING.pulse_cost
  ) {
    p.carried -= TUNING.pulse_cost;
    p.pulseCdTicks = PULSE_CD_TICKS;
    const pulseCenter: Vec3 = [p.pos[0], p.pos[1] + PULSE_ORIGIN_Y_OFFSET, p.pos[2]];
    const stunnedIds: string[] = [];

    for (const shade of sortedIds(state.shades)) {
      if (shade.createdTick >= state.simTick) continue;
      if (dist3D(pulseCenter, shade.pos) <= TUNING.pulse_radius) {
        const wasDraining = shade.state === 'drain';
        const dx = shade.pos[0] - p.pos[0];
        const dz = shade.pos[2] - p.pos[2];
        const d = Math.hypot(dx, dz);
        shade.pushDir = d > 1e-6 ? [dx / d, dz / d] : [1, 0]; // +X if coincident
        shade.state = 'stunned';
        shade.stateTicksLeft = PULSE_STUN_TICKS;
        shade.pushTicksLeft = PULSE_PUSH_TICKS;
        shade.targetLanternId = null;
        shade.drainTicks = 0;
        state.score += wasDraining ? TUNING.score.per_stun_drain : TUNING.score.per_stun;
        stunnedIds.push(shade.id);
      }
    }

    for (const drifter of sortedIds(state.drifters)) {
      if (drifter.createdTick >= state.simTick) continue;
      if (dist3D(pulseCenter, drifter.pos) <= TUNING.pulse_radius) {
        if (drifter.state === 'flee' && drifter.stolen > 0) {
          const dropAmt = drifter.stolen;
          spawnDroppedMotes(state, drifter.pos, dropAmt, 0.3, 1.0);
          drifter.stolen = 0;
          drifter.stateTicksLeft = DRIFTER_FLEE_PULSE_TICKS;
          events.push({
            type: 'event',
            tick: state.tick,
            name: 'drifter_drop',
            data: { drifter_id: drifter.id, amount: dropAmt }
          });
        } else if (drifter.state === 'idle' || drifter.state === 'chase') {
          drifter.state = 'flee';
          drifter.hasStolen = true;
          drifter.stolen = 0;
          drifter.stateTicksLeft = DRIFTER_FLEE_PULSE_TICKS;
        }
      }
    }

    events.push({ type: 'event', tick: state.tick, name: 'pulse', data: { stunned_ids: stunnedIds } });
  }

  // 8. Move Shades & Drifters
  const map = getMapConfig(state.night);
  for (const shade of sortedIds(state.shades)) {
    const sx0 = shade.pos[0];
    const sz0 = shade.pos[2];

    if (shade.state === 'stunned') {
      if (shade.pushTicksLeft > 0) {
        const pushStep = TUNING.pulse_push_m / PULSE_PUSH_TICKS;
        const rawX = sx0 + shade.pushDir[0] * pushStep;
        const rawZ = sz0 + shade.pushDir[1] * pushStep;
        const [nx, nz] = resolveMovementObstacles(state.night, sx0, sz0, rawX, rawZ, shade.pos[1]);
        const floor = getHighestGroundAt(state.night, nx, nz, shade.pos[1]);
        if (floor !== null) {
          shade.pos[0] = nx;
          shade.pos[2] = nz;
          shade.pos[1] = floor + SHADE_DEFAULT_Y_OFFSET;
        } else {
          shade.pushTicksLeft = 0; // stop pushing if hitting cliff edge
        }
      }
      pushShadeOutOfSafeZone(shade, state.lanterns, p.pos, false);
      continue;
    }

    if (shade.state === 'spawning') continue;

    if (shade.state === 'recoil') {
      const step = RECOIL_DIST_M / RECOIL_TICKS;
      const rawX = sx0 + shade.recoilDir[0] * step;
      const rawZ = sz0 + shade.recoilDir[1] * step;
      const [nx, nz] = resolveMovementObstacles(state.night, sx0, sz0, rawX, rawZ, shade.pos[1]);
      if (getHighestGroundAt(state.night, nx, nz, shade.pos[1]) !== null) {
        shade.pos[0] = nx;
        shade.pos[2] = nz;
      }
      pushShadeOutOfSafeZone(shade, state.lanterns, p.pos, false);
      continue;
    }

    const dToPlayer = dist3D(shade.pos, [p.pos[0], p.pos[1] + 1, p.pos[2]]);

    if (shade.state === 'drain') {
      if (dToPlayer <= DRAIN_CHASE_DIST_M) {
        shade.state = 'chase';
        shade.targetLanternId = null;
        shade.drainTicks = 0;
      } else {
        const target = shade.targetLanternId
          ? state.lanterns.find((l) => l.id === shade.targetLanternId)
          : undefined;
        if (
          !target ||
          !target.lit ||
          target.fuelTicks >= LOW_FUEL_TICKS ||
          distXZ(shade.pos, target.pos) > DRAIN_RANGE_M
        ) {
          shade.state = 'wander';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
        } else {
          continue; // Stay still while draining fuel
        }
      }
    }

    if (!state.benchMode && shade.state === 'wander' && dToPlayer <= SHADE_DETECT_RADIUS) {
      shade.state = 'chase';
      shade.targetLanternId = null;
      shade.drainTicks = 0;
    } else if (shade.state === 'chase' && dToPlayer > SHADE_LEASH_RADIUS) {
      shade.state = 'wander';
      shade.wanderTimerTicks = 0;
    }

    if (shade.state === 'wander') {
      // Weak lit lantern (< 30 fuel) first, then nearest unlit lantern, tie-break smaller id
      let targetLantern: LanternState | null = null;
      let bestWeakDist = Infinity;
      for (const l of sortedIds(state.lanterns)) {
        if (l.lit && l.fuelTicks < LOW_FUEL_TICKS) {
          const d = distXZ(shade.pos, l.pos);
          if (d < bestWeakDist) {
            bestWeakDist = d;
            targetLantern = l;
          }
        }
      }
      if (!targetLantern) {
        let bestUnlitDist = Infinity;
        for (const l of sortedIds(state.lanterns)) {
          if (!l.lit) {
            const d = distXZ(shade.pos, l.pos);
            if (d < bestUnlitDist) {
              bestUnlitDist = d;
              targetLantern = l;
            }
          }
        }
      }

      if (targetLantern) {
        const dToLantern = distXZ(shade.pos, targetLantern.pos);
        if (targetLantern.lit && targetLantern.fuelTicks < LOW_FUEL_TICKS && dToLantern <= DRAIN_RANGE_M) {
          shade.state = 'drain';
          shade.targetLanternId = targetLantern.id;
          shade.drainTicks = 0;
          continue;
        }
        const dx = targetLantern.pos[0] - sx0;
        const dz = targetLantern.pos[2] - sz0;
        if (dToLantern > 0.5) {
          const wStep = Math.min(dToLantern, map.shadeSpeed * 0.5 * DT);
          const rawX = sx0 + (dx / dToLantern) * wStep;
          const rawZ = sz0 + (dz / dToLantern) * wStep;
          const [nx, nz] = resolveMovementObstacles(state.night, sx0, sz0, rawX, rawZ, shade.pos[1]);
          const floor = getHighestGroundAt(state.night, nx, nz, shade.pos[1]);
          if (floor !== null) {
            shade.pos[0] = nx;
            shade.pos[2] = nz;
            shade.pos[1] = floor + SHADE_DEFAULT_Y_OFFSET;
          }
          if (
            targetLantern.lit &&
            targetLantern.fuelTicks < LOW_FUEL_TICKS &&
            distXZ(shade.pos, targetLantern.pos) <= DRAIN_RANGE_M
          ) {
            shade.state = 'drain';
            shade.targetLanternId = targetLantern.id;
            shade.drainTicks = 0;
            continue;
          }
        }
      } else {
        if (shade.wanderTimerTicks <= 0) {
          const angle = state.rng() * Math.PI * 2;
          shade.wanderDir = [Math.cos(angle), Math.sin(angle)];
          shade.wanderTimerTicks = 90 + Math.floor(state.rng() * 60);
        }
        const wStep = (map.shadeSpeed * 0.5) * DT;
        const rawX = sx0 + shade.wanderDir[0] * wStep;
        const rawZ = sz0 + shade.wanderDir[1] * wStep;
        const [nx, nz] = resolveMovementObstacles(state.night, sx0, sz0, rawX, rawZ, shade.pos[1]);
        const floor = getHighestGroundAt(state.night, nx, nz, shade.pos[1]);
        if (floor !== null) {
          shade.pos[0] = nx;
          shade.pos[2] = nz;
          shade.pos[1] = floor + SHADE_DEFAULT_Y_OFFSET;
        } else {
          shade.wanderDir = [-shade.wanderDir[0], -shade.wanderDir[1]];
        }
      }
      pushShadeOutOfSafeZone(shade, state.lanterns, p.pos, false);
    } else if (shade.state === 'chase') {
      const dx = p.pos[0] - sx0;
      const dz = p.pos[2] - sz0;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-6) {
        const cStep = Math.min(dist, map.shadeSpeed * DT);
        const rawX = sx0 + (dx / dist) * cStep;
        const rawZ = sz0 + (dz / dist) * cStep;
        const [nx, nz] = resolveMovementObstacles(state.night, sx0, sz0, rawX, rawZ, shade.pos[1]);
        const floor = getHighestGroundAt(state.night, nx, nz, shade.pos[1]);
        if (floor !== null) {
          shade.pos[0] = nx;
          shade.pos[2] = nz;
          shade.pos[1] = floor + SHADE_DEFAULT_Y_OFFSET;
        }
      }
      pushShadeOutOfSafeZone(shade, state.lanterns, p.pos, true);
    }
  }

  for (const drifter of sortedIds(state.drifters)) {
    if (drifter.state === 'idle') {
      if (
        !drifter.hasStolen &&
        p.carried >= DRIFTER_AGGRO_MIN_CARRIED &&
        distXZ(drifter.pos, p.pos) <= DRIFTER_AGGRO_RADIUS
      ) {
        drifter.state = 'chase';
      } else {
        drifter.wanderAngle += 0.025;
        drifter.pos[0] += Math.cos(drifter.wanderAngle) * DRIFTER_IDLE_SPEED * DT;
        drifter.pos[1] = approach(drifter.pos[1], 1.5, 2.0 * DT);
        drifter.pos[2] += Math.sin(drifter.wanderAngle) * DRIFTER_IDLE_SPEED * DT;
        clampToFog(drifter.pos, state.night);
      }
    } else if (drifter.state === 'chase') {
      if (
        drifter.hasStolen ||
        p.carried < DRIFTER_AGGRO_MIN_CARRIED ||
        distXZ(drifter.pos, p.pos) > DRIFTER_AGGRO_RADIUS
      ) {
        drifter.state = 'idle';
      } else {
        const dx = p.pos[0] - drifter.pos[0];
        const dz = p.pos[2] - drifter.pos[2];
        const d = Math.hypot(dx, dz) || 1;
        const step = Math.min(d, DRIFTER_FAST_SPEED * DT);
        drifter.pos[0] += (dx / d) * step;
        drifter.pos[1] = approach(drifter.pos[1], p.pos[1] + 0.8, 4.5 * DT);
        drifter.pos[2] += (dz / d) * step;
      }
    } else if (drifter.state === 'flee') {
      const dx = drifter.pos[0] - p.pos[0];
      const dz = drifter.pos[2] - p.pos[2];
      const d = Math.hypot(dx, dz);
      const dirX = d > 1e-6 ? dx / d : 1;
      const dirZ = d > 1e-6 ? dz / d : 0;
      drifter.pos[0] += dirX * DRIFTER_FAST_SPEED * DT;
      drifter.pos[1] = approach(drifter.pos[1], Math.max(1.5, p.pos[1] + 1.2), 2.5 * DT);
      drifter.pos[2] += dirZ * DRIFTER_FAST_SPEED * DT;
      clampToFog(drifter.pos, state.night);
    }
  }

  // 9. Contacts: Drifters steal FIRST, then Shades deal hit (max 1 flame lost per tick)
  if (!state.benchMode && p.fallWaitTicks === 0 && p.flames > 0) {
    for (const drifter of sortedIds(state.drifters)) {
      if (drifter.createdTick >= state.simTick) continue;
      if (
        drifter.state === 'chase' &&
        !drifter.hasStolen &&
        distXZ(drifter.pos, p.pos) <= DRIFTER_STEAL_RADIUS &&
        Math.abs(drifter.pos[1] - (p.pos[1] + 0.8)) <= 2.0
      ) {
        const amount = Math.min(DRIFTER_STEAL_MAX, p.carried);
        p.carried -= amount;
        drifter.stolen = amount;
        drifter.hasStolen = true;
        drifter.state = 'flee';
        drifter.stateTicksLeft = DRIFTER_FLEE_STEAL_TICKS;
        events.push({
          type: 'event',
          tick: state.tick,
          name: 'drifter_steal',
          data: { drifter_id: drifter.id, amount, carried: p.carried }
        });
      }
    }

    let hitThisTick = false;
    for (const shade of sortedIds(state.shades)) {
      if (hitThisTick || p.invulnTicks > 0) break;
      if (shade.createdTick >= state.simTick) continue;
      if (
        shade.state === 'spawning' ||
        shade.state === 'stunned' ||
        shade.state === 'recoil' ||
        shade.safePushTicksLeft > 0
      ) {
        continue;
      }
      if (
        distXZ(p.pos, shade.pos) <= TUNING.shade_hit_radius &&
        Math.abs(p.pos[1] - shade.pos[1]) <= SHADE_HIT_MAX_DY
      ) {
        hitThisTick = true;
        p.flames = Math.max(0, p.flames - 1);
        const dropped = Math.floor(p.carried * TUNING.hit_drop_ratio);
        p.carried -= dropped;
        p.invulnTicks = INVULN_TICKS;
        spawnDroppedMotes(state, p.pos, dropped, 1.5, 2.5);

        const dx = shade.pos[0] - p.pos[0];
        const dz = shade.pos[2] - p.pos[2];
        const d = Math.hypot(dx, dz);
        shade.recoilDir = d > 1e-6 ? [dx / d, dz / d] : [1, 0];
        shade.state = 'recoil';
        shade.stateTicksLeft = RECOIL_TICKS;

        events.push({
          type: 'event',
          tick: state.tick,
          name: 'player_hit',
          data: { by: 'shade', flames: p.flames, dropped }
        });
      }
    }
  }

  // 10. Scheduled Spawns (new entities interact starting next tick)
  if (state.randomMotes && state.simTick % MOTE_RESPAWN_INTERVAL_TICKS === 0) {
    if (state.motes.length < MAX_ACTIVE_MOTES) {
      const freePoints = map.moteSpawnPoints.filter(
        (pt) => !state.motes.some((m) => distXZ(m.pos, pt) < 0.5 && Math.abs(m.pos[1] - pt[1]) < 0.5)
      );
      if (freePoints.length > 0) {
        const pt = freePoints[Math.floor(state.rng() * freePoints.length)];
        const id = allocateNextId(state, 'M');
        state.motes.push({
          id,
          pos: [pt[0], pt[1], pt[2]],
          kind: 'random',
          ttlTicks: null,
          createdTick: state.simTick
        });
      }
    }
  }

  if (state.randomShades && state.simTick === state.nextShadeSpawnTick) {
    const desired = !state.initialShadeSpawned ? 2 : 1;
    const validPoints = map.shadeSpawnPoints.filter(
      (pt) =>
        distXZ(pt, p.pos) >= SHADE_SPAWN_MIN_PLAYER_DIST &&
        !state.lanterns.some(
          (l) => l.lit && l.fuelTicks >= LOW_FUEL_TICKS && distXZ(pt, l.pos) < TUNING.safe_radius
        )
    );
    const pool = [...validPoints];
    for (let i = 0; i < desired && state.shades.length < map.maxShades && pool.length > 0; i++) {
      const idx = Math.floor(state.rng() * pool.length);
      const pt = pool.splice(idx, 1)[0];
      const id = allocateNextId(state, 'S');
      state.shades.push({
        id,
        pos: [pt[0], pt[1] + SHADE_DEFAULT_Y_OFFSET, pt[2]],
        state: 'spawning',
        stateTicksLeft: SHADE_SPAWNING_TICKS,
        pushTicksLeft: 0,
        pushDir: [1, 0],
        recoilDir: [1, 0],
        safePushTicksLeft: 0,
        wanderDir: [1, 0],
        wanderTimerTicks: 0,
        targetLanternId: null,
        drainTicks: 0,
        createdTick: state.simTick
      });
      events.push({ type: 'event', tick: state.tick, name: 'shade_spawned', data: { id } });
    }
    state.initialShadeSpawned = true;
    state.nextShadeSpawnTick += map.shadeSpawnIntervalTicks;
  }

  if (
    state.randomDrifters &&
    state.simTick % DRIFTER_SPAWN_INTERVAL_TICKS === 0 &&
    state.drifters.length < DRIFTER_MAX_COUNT
  ) {
    const id = allocateNextId(state, 'D');
    const pos = sampleDrifterMistPoint(state.night, state.rng);
    state.drifters.push({
      id,
      pos,
      state: 'idle',
      stolen: 0,
      hasStolen: false,
      stateTicksLeft: 0,
      wanderAngle: round3(state.rng() * Math.PI * 2),
      createdTick: state.simTick
    });
  }

  // 11. Win / Loss resolution (no_flames always evaluated first, then dawn survival >= ceil(0.6 * total))
  if (!state.benchMode) {
    if (p.flames <= 0) {
      state.status = 'lost';
      events.push({
        type: 'event',
        tick: state.tick,
        name: 'game_over',
        data: { result: 'lost', reason: 'no_flames' }
      });
    } else if (state.timeLeftS <= 0) {
      const litLanterns = state.lanterns.filter((l) => l.lit);
      const requiredLit = Math.ceil(TUNING.win_ratio * state.lanterns.length);
      if (litLanterns.length >= requiredLit) {
        for (const l of litLanterns) {
          state.score += TUNING.score.per_lantern_dawn + Math.floor(l.fuelTicks / 60);
        }
        state.score += p.flames * TUNING.score.per_flame_left;
        state.status = 'won';
        events.push({
          type: 'event',
          tick: state.tick,
          name: 'game_over',
          data: { result: 'won', reason: 'dawn_survived' }
        });
      } else {
        state.status = 'lost';
        events.push({
          type: 'event',
          tick: state.tick,
          name: 'game_over',
          data: { result: 'lost', reason: 'dawn' }
        });
      }
    }
  }

  return events;
}
