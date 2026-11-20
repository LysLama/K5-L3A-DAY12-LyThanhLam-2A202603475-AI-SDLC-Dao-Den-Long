import { SHADE_NIGHT3_SPEED, TUNING } from './constants';
import type { MoteTier, NightId, Vec2, Vec3 } from './types';

export interface JumpPadDef {
  pos: Vec3;
  radius: number;
  vy: number;
  horizSpeed: number;
  dirXZ: Vec2;
}

export interface MapConfig {
  night: NightId;
  name: string;
  durationS: number;
  spawnPos: Vec3;
  spawnFacing: Vec2;
  shadeSpeed: number;
  shadeSpawnIntervalTicks: number;
  maxShades: number;
  driftersEnabled: boolean;
  windEnabled: boolean;
  lanterns: ReadonlyArray<{ id: string; pos: Vec3 }>;
  moteSpawnPoints: ReadonlyArray<Vec3>;
  shadeSpawnPoints: ReadonlyArray<Vec3>;
  jumpPads: ReadonlyArray<JumpPadDef>;
  charms: ReadonlyArray<{ id: string; pos: Vec3 }>;
}

function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

function ringPoints(
  cx: number,
  cz: number,
  y: number,
  radius: number,
  startDeg: number,
  stepDeg: number,
  count: number
): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const rad = ((startDeg + i * stepDeg) * Math.PI) / 180;
    pts.push([round3(cx + radius * Math.cos(rad)), y, round3(cz + radius * Math.sin(rad))]);
  }
  return pts;
}

function unitVec(dx: number, dz: number): Vec2 {
  const d = Math.hypot(dx, dz) || 1;
  return [dx / d, dz / d];
}

const NIGHT1_CONFIG: MapConfig = {
  night: 1,
  name: 'Đảo Bến',
  durationS: TUNING.night1_duration_s,
  spawnPos: [0, 0, 0],
  spawnFacing: [0, 1],
  shadeSpeed: TUNING.shade_speed,
  shadeSpawnIntervalTicks: 480, // 8s
  maxShades: 6,
  driftersEnabled: false,
  windEnabled: false,
  lanterns: [
    { id: 'L1', pos: [0, 0, 25] },
    { id: 'L2', pos: [23.8, 0, 7.7] },
    { id: 'L3', pos: [14.7, 0, -20.2] },
    { id: 'L4', pos: [-14.7, 0, -20.2] },
    { id: 'L5', pos: [-23.8, 0, 7.7] }
  ],
  moteSpawnPoints: [
    ...ringPoints(0, 0, 0, 12, 0, 45, 8),
    ...ringPoints(0, 0, 0, 33, 0, 22.5, 16)
  ],
  shadeSpawnPoints: ringPoints(0, 0, 0, 37, 15, 30, 12),
  jumpPads: [],
  charms: []
};

const NIGHT2_CONFIG: MapConfig = {
  night: 2,
  name: 'Đảo Cau',
  durationS: TUNING.night2_duration_s,
  spawnPos: [0, 0, 0],
  spawnFacing: [0, 1],
  shadeSpeed: TUNING.shade_speed,
  shadeSpawnIntervalTicks: 420, // 7s
  maxShades: 8,
  driftersEnabled: true,
  windEnabled: false,
  lanterns: [
    { id: 'L1', pos: [0, 0, 20] },
    { id: 'L2', pos: [17, 0, -10] },
    { id: 'L3', pos: [-17, 0, -10] },
    { id: 'L4', pos: [70, 0, 20] },
    { id: 'L5', pos: [87, 0, -10] },
    { id: 'L6', pos: [53, 0, -10] }
  ],
  moteSpawnPoints: [
    ...ringPoints(0, 0, 0, 10, 0, 90, 4),
    ...ringPoints(0, 0, 0, 22, 0, 45, 8),
    ...ringPoints(70, 0, 0, 10, 0, 90, 4),
    ...ringPoints(70, 0, 0, 22, 0, 45, 8)
  ],
  shadeSpawnPoints: [
    ...ringPoints(0, 0, 0, 26, 22.5, 45, 8),
    ...ringPoints(70, 0, 0, 26, 22.5, 45, 8)
  ],
  jumpPads: [
    { pos: [20, 0, 18], radius: 1.0, vy: 14.0, horizSpeed: 24.0, dirXZ: unitVec(70 - 20, 0 - 18) },
    { pos: [50, 0, -18], radius: 1.0, vy: 14.0, horizSpeed: 24.0, dirXZ: unitVec(0 - 50, 0 - -18) }
  ],
  charms: [{ id: 'C1', pos: [35, 0, 0] }]
};

const NIGHT3_CONFIG: MapConfig = {
  night: 3,
  name: 'Đảo Chuông',
  durationS: TUNING.night3_duration_s,
  spawnPos: [0, 0, 28],
  spawnFacing: [0, -1],
  shadeSpeed: SHADE_NIGHT3_SPEED,
  shadeSpawnIntervalTicks: 360, // 6s
  maxShades: 10,
  driftersEnabled: true,
  windEnabled: true,
  lanterns: [
    { id: 'L1', pos: [0, 6, 6] },
    { id: 'L2', pos: [18, 3, 10] },
    { id: 'L3', pos: [-18, 3, 10] },
    { id: 'L4', pos: [35, 0, -10] },
    { id: 'L5', pos: [-35, 0, -10] },
    { id: 'L6', pos: [20, 0, -35] },
    { id: 'L7', pos: [-20, 0, -35] }
  ],
  moteSpawnPoints: [
    ...ringPoints(0, 0, 0, 34, 0, 20, 18),
    ...ringPoints(0, 0, 3, 18, 20, 20, 8),
    ...ringPoints(0, 0, 6, 5, 45, 90, 4)
  ],
  shadeSpawnPoints: ringPoints(0, 0, 0, 43, 0, 22.5, 16),
  jumpPads: [{ pos: [0, 3, 13], radius: 1.0, vy: 12.0, horizSpeed: 8.0, dirXZ: [0, -1] }],
  charms: [
    { id: 'C1', pos: [30, 0, 25] },
    { id: 'C2', pos: [-30, 0, 25] }
  ]
};

export function getMapConfig(night: NightId): MapConfig {
  if (night === 1) return NIGHT1_CONFIG;
  if (night === 2) return NIGHT2_CONFIG;
  return NIGHT3_CONFIG;
}

const RAMP_ANGLES_RAD = [(30 * Math.PI) / 180, (150 * Math.PI) / 180];

export function getRampHeightAt(x: number, z: number): number | null {
  for (const rad of RAMP_ANGLES_RAD) {
    const ux = Math.cos(rad);
    const uz = Math.sin(rad);
    const vx = -uz;
    const vz = ux;
    const s = x * ux + z * uz;
    const lat = Math.abs(x * vx + z * vz);
    if (s >= 24.0 && s <= 30.0 && lat <= 1.5) {
      return 3.0 * ((30.0 - s) / 6.0);
    }
  }
  return null;
}

export function getAllGroundFloorsAt(night: NightId, x: number, z: number): number[] {
  if (night === 1) {
    return Math.hypot(x, z) <= 40.0 ? [0] : [];
  }
  if (night === 2) {
    const onA = Math.hypot(x, z) <= 28.0;
    const onB = Math.hypot(x - 70.0, z) <= 28.0;
    const onBridge = x >= 26.0 && x <= 44.0 && z >= -2.0 && z <= 2.0;
    return onA || onB || onBridge ? [0] : [];
  }
  const floors: number[] = [];
  const r = Math.hypot(x, z);
  if (r <= 45.0) floors.push(0);
  const rampY = getRampHeightAt(x, z);
  if (rampY !== null) floors.push(rampY);
  if (r >= 12.0 && r <= 24.0 && z > 0) floors.push(3.0);
  if (r <= 8.0) floors.push(6.0);
  return floors;
}

export function getHighestGroundAt(night: NightId, x: number, z: number, currentY: number): number | null {
  const floors = getAllGroundFloorsAt(night, x, z);
  let best: number | null = null;
  for (const fy of floors) {
    if (fy <= currentY + 0.35 && (best === null || fy > best)) {
      best = fy;
    }
  }
  return best;
}

export function isInBellTower(night: NightId, x: number, y: number, z: number): boolean {
  if (night !== 3) return false;
  return y < 14.0 && Math.hypot(x, z) < 2.0;
}

export function resolveMovementObstacles(
  night: NightId,
  prevX: number,
  prevZ: number,
  nextX: number,
  nextZ: number,
  y: number
): Vec2 {
  if (night !== 3) return [nextX, nextZ];

  let x = nextX;
  let z = nextZ;

  // 1. Bell Tower solid cylinder at center (radius 2m, Y < 14m)
  if (y < 14.0) {
    const r = Math.hypot(x, z);
    if (r < 2.0) {
      if (r > 1e-6) {
        const s = 2.001 / r;
        x *= s;
        z *= s;
      } else {
        x = 2.001;
        z = 0;
      }
    }
  }

  // 2. Tier 2 vertical cliff wall (radius <= 8m, Y = 6m)
  const prevR = Math.hypot(prevX, prevZ);
  const nextR = Math.hypot(x, z);
  if (y < 5.85 && prevR >= 7.99 && nextR < 8.0) {
    const s = 8.001 / (nextR || 1);
    x *= s;
    z *= s;
  }

  // 2b. Ramp side walls: prevent actors from walking or dashing sideways under/into an elevated ramp
  for (const rad of RAMP_ANGLES_RAD) {
    const ux = Math.cos(rad);
    const uz = Math.sin(rad);
    const vx = -uz;
    const vz = ux;
    const sNext = x * ux + z * uz;
    const latNext = x * vx + z * vz;
    if (sNext >= 23.95 && sNext <= 29.85 && Math.abs(latNext) < 1.52) {
      const rampY = 3.0 * ((30.0 - Math.max(24.0, Math.min(30.0, sNext))) / 6.0);
      if (y < rampY - 0.42) {
        const latPrev = prevX * vx + prevZ * vz;
        const sign = latPrev >= 0 ? 1 : -1;
        if (Math.abs(latPrev) >= 1.48) {
          const clampedLat = sign * 1.525;
          x = sNext * ux + clampedLat * vx;
          z = sNext * uz + clampedLat * vz;
        }
      }
    }
  }

  // 3. Tier 1 vertical cliff walls (12 <= r <= 24 && z > 0, Y = 3m), allowing entry only via the top of ramps
  const rampYAtNext = getRampHeightAt(x, z);
  const onValidRampSurface = rampYAtNext !== null && y >= rampYAtNext - 0.55;
  if (y < 2.85 && !onValidRampSurface) {
    const prevInT1 = prevR >= 12.0 && prevR <= 24.0 && prevZ > 0;
    const rAfter = Math.hypot(x, z);
    const nextInT1 = rAfter >= 12.0 && rAfter <= 24.0 && z > 0;
    if (!prevInT1 && nextInT1) {
      if (prevR < 12.0) {
        const s = 11.999 / (rAfter || 1);
        x *= s;
        z *= s;
      } else if (prevR > 24.0) {
        const s = 24.001 / (rAfter || 1);
        x *= s;
        z *= s;
      } else if (prevZ <= 0) {
        z = -0.001;
      }
    }
  }

  return [x, z];
}

/**
 * Rolls one of 5 firefly orb tiers (values 1..5) with strictly decreasing probability:
 * Tier 1: 40%, Tier 2: 25%, Tier 3: 18%, Tier 4: 11%, Tier 5: 6%.
 */
export function rollMoteTier(rng: () => number): MoteTier {
  const u = rng();
  if (u < 0.40) return 1;
  if (u < 0.65) return 2;
  if (u < 0.83) return 3;
  if (u < 0.94) return 4;
  return 5;
}

/**
 * Samples a completely random valid orb position within the island boundaries for Night 1, 2, or 3.
 */
export function sampleRandomIslandMotePos(
  night: NightId,
  rng: () => number,
  existingPositions: ReadonlyArray<Vec3>,
  avoidPos?: Vec3
): Vec3 {
  const cfg = getMapConfig(night);
  let lastCandidate: Vec3 = [0, 0, 10];

  for (let attempt = 0; attempt < 48; attempt++) {
    let x = 0;
    let y = 0;
    let z = 0;

    if (night === 1) {
      const r = 3.2 + Math.sqrt(rng()) * 34.6; // [3.2 .. 37.8] inside R=40
      const angle = rng() * Math.PI * 2;
      x = round3(Math.cos(angle) * r);
      z = round3(Math.sin(angle) * r);
      y = 0;
    } else if (night === 2) {
      const cx = rng() < 0.5 ? 0 : 70;
      const r = 2.0 + Math.sqrt(rng()) * 24.0; // [2.0 .. 26.0] inside R=28
      const angle = rng() * Math.PI * 2;
      x = round3(cx + Math.cos(angle) * r);
      z = round3(Math.sin(angle) * r);
      y = 0;
    } else {
      const r = 3.0 + Math.sqrt(rng()) * 39.5; // [3.0 .. 42.5] inside R=45, outside Bell Tower r<2
      const angle = rng() * Math.PI * 2;
      x = round3(Math.cos(angle) * r);
      z = round3(Math.sin(angle) * r);
      // Avoid cliff step seams on Night 3
      if ((r > 7.4 && r < 8.7) || (z > -0.5 && ((r > 11.3 && r < 12.7) || (r > 23.3 && r < 24.7)))) {
        continue;
      }
      if (getRampHeightAt(x, z) !== null) continue;
      if (r <= 7.4) y = 6;
      else if (r >= 12.7 && r <= 23.3 && z > 0.5) y = 3;
      else y = 0;
    }

    lastCandidate = [x, y, z];

    if (avoidPos && Math.hypot(x - avoidPos[0], z - avoidPos[2]) < 2.6) continue;
    let tooClose = false;
    for (const l of cfg.lanterns) {
      if (Math.hypot(x - l.pos[0], z - l.pos[2]) < 2.4) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    for (const jp of cfg.jumpPads) {
      if (Math.hypot(x - jp.pos[0], z - jp.pos[2]) < 1.8) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    for (const m of existingPositions) {
      if (Math.hypot(x - m[0], z - m[2]) < 1.8 && Math.abs(y - m[1]) < 1.0) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) return lastCandidate;
  }

  return lastCandidate;
}

export function findJumpPadHit(night: NightId, x: number, y: number, z: number): JumpPadDef | null {
  const pads = getMapConfig(night).jumpPads;
  for (const pad of pads) {
    if (Math.hypot(x - pad.pos[0], z - pad.pos[2]) <= pad.radius && Math.abs(y - pad.pos[1]) <= 0.4) {
      return pad;
    }
  }
  return null;
}

export function sampleDrifterMistPoint(night: NightId, rng: () => number): Vec3 {
  if (night === 2) {
    const center = rng() < 0.5 ? 0 : 70;
    const angle = rng() * Math.PI * 2;
    const r = 24 + rng() * 6;
    return [round3(center + r * Math.cos(angle)), 1.5, round3(r * Math.sin(angle))];
  }
  const angle = rng() * Math.PI * 2;
  const r = 38 + rng() * 6;
  return [round3(r * Math.cos(angle)), 1.5, round3(r * Math.sin(angle))];
}
