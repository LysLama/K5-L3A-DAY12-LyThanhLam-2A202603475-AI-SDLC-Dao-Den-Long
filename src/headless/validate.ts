import type {
  DrifterBehaviorState,
  InputFrame,
  MoteKind,
  ScenarioConfig,
  ShadeBehaviorState,
  Vec2,
  Vec3
} from '../sim/types';

export class ContractValidationError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

const VALID_SHADE_STATES = new Set<ShadeBehaviorState>([
  'spawning',
  'wander',
  'chase',
  'recoil',
  'stunned',
  'drain'
]);
const VALID_DRIFTER_STATES = new Set<DrifterBehaviorState>(['idle', 'chase', 'flee']);
const VALID_MOTE_KINDS = new Set<MoteKind>(['random', 'dropped']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ContractValidationError(`${label} must be a finite number`);
  }
  return v;
}

function assertNonNegInt(v: unknown, label: string): number {
  const n = assertFiniteNumber(v, label);
  if (!Number.isInteger(n) || n < 0) {
    throw new ContractValidationError(`${label} must be a non-negative integer`);
  }
  return n;
}

function assertVec3(v: unknown, label: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) {
    throw new ContractValidationError(`${label} must be a [x, y, z] array`);
  }
  return [
    assertFiniteNumber(v[0], `${label}[0]`),
    assertFiniteNumber(v[1], `${label}[1]`),
    assertFiniteNumber(v[2], `${label}[2]`)
  ];
}

function assertMoveVec2(v: unknown, label: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2) {
    throw new ContractValidationError(`${label} must be a [x, z] array`);
  }
  const x = assertFiniteNumber(v[0], `${label}[0]`);
  const z = assertFiniteNumber(v[1], `${label}[1]`);
  if (x < -1 || x > 1 || z < -1 || z > 1) {
    throw new ContractValidationError(`${label} components must be in [-1, 1]`);
  }
  return [x, z];
}

function parseJson(raw: string, kind: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ContractValidationError(`Invalid ${kind} JSON: ${msg}`);
  }
}

export function parseAndValidateInputs(rawJson: string): InputFrame[] {
  const root = parseJson(rawJson, 'inputs');
  if (!isPlainObject(root) || !Array.isArray(root.frames)) {
    throw new ContractValidationError('inputs root must be an object with a "frames" array');
  }

  let prevTick = -1;
  const frames: InputFrame[] = [];

  for (let i = 0; i < root.frames.length; i++) {
    const raw = root.frames[i];
    if (!isPlainObject(raw)) {
      throw new ContractValidationError(`frames[${i}] must be an object`);
    }
    const tick = assertNonNegInt(raw.tick, `frames[${i}].tick`);
    if (tick <= prevTick) {
      throw new ContractValidationError(
        `frames[${i}].tick (${tick}) must strictly increase after ${prevTick}`
      );
    }
    prevTick = tick;

    const frame: InputFrame = { tick };
    if (raw.move !== undefined) frame.move = assertMoveVec2(raw.move, `frames[${i}].move`);
    if (raw.cam_yaw_deg !== undefined) {
      frame.cam_yaw_deg = assertFiniteNumber(raw.cam_yaw_deg, `frames[${i}].cam_yaw_deg`);
    }
    for (const key of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) {
      if (raw[key] !== undefined) {
        if (typeof raw[key] !== 'boolean') {
          throw new ContractValidationError(`frames[${i}].${key} must be a boolean`);
        }
        frame[key] = raw[key];
      }
    }
    frames.push(frame);
  }

  return frames;
}

export function parseAndValidateScenario(rawJson: string): ScenarioConfig {
  const root = parseJson(rawJson, 'scenario');
  if (!isPlainObject(root)) {
    throw new ContractValidationError('scenario root must be a JSON object');
  }

  const out: ScenarioConfig = {};

  if (root.player !== undefined) {
    if (!isPlainObject(root.player)) {
      throw new ContractValidationError('scenario.player must be an object');
    }
    out.player = {};
    if (root.player.pos !== undefined) out.player.pos = assertVec3(root.player.pos, 'scenario.player.pos');
    if (root.player.carried !== undefined) out.player.carried = assertNonNegInt(root.player.carried, 'scenario.player.carried');
    if (root.player.flames !== undefined) out.player.flames = assertNonNegInt(root.player.flames, 'scenario.player.flames');
    if (root.player.successful_lights !== undefined) {
      out.player.successful_lights = assertNonNegInt(root.player.successful_lights, 'scenario.player.successful_lights');
    }
    if (root.player.invuln_ticks !== undefined) out.player.invuln_ticks = assertNonNegInt(root.player.invuln_ticks, 'scenario.player.invuln_ticks');
    if (root.player.dash_cd_ticks !== undefined) out.player.dash_cd_ticks = assertNonNegInt(root.player.dash_cd_ticks, 'scenario.player.dash_cd_ticks');
    if (root.player.pulse_cd_ticks !== undefined) out.player.pulse_cd_ticks = assertNonNegInt(root.player.pulse_cd_ticks, 'scenario.player.pulse_cd_ticks');
    if (root.player.charm_ticks !== undefined) out.player.charm_ticks = assertNonNegInt(root.player.charm_ticks, 'scenario.player.charm_ticks');
  }

  for (const bKey of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled'] as const) {
    if (root[bKey] !== undefined) {
      if (typeof root[bKey] !== 'boolean') {
        throw new ContractValidationError(`scenario.${bKey} must be a boolean`);
      }
      out[bKey] = root[bKey];
    }
  }

  if (root.time_left_s !== undefined) {
    const t = assertFiniteNumber(root.time_left_s, 'scenario.time_left_s');
    if (t <= 0) throw new ContractValidationError('scenario.time_left_s must be > 0');
    out.time_left_s = t;
  }

  if (root.motes !== undefined) {
    if (!Array.isArray(root.motes)) {
      throw new ContractValidationError('scenario.motes must be an array');
    }
    out.motes = root.motes.map((item, idx) => {
      if (Array.isArray(item)) return assertVec3(item, `scenario.motes[${idx}]`);
      if (isPlainObject(item)) {
        const pos = assertVec3(item.pos, `scenario.motes[${idx}].pos`);
        if (item.id !== undefined && typeof item.id !== 'string') {
          throw new ContractValidationError(`scenario.motes[${idx}].id must be a string`);
        }
        if (item.kind !== undefined && (typeof item.kind !== 'string' || !VALID_MOTE_KINDS.has(item.kind as MoteKind))) {
          throw new ContractValidationError(`scenario.motes[${idx}].kind invalid`);
        }
        const ttl = item.ttl_s !== undefined ? assertFiniteNumber(item.ttl_s, `scenario.motes[${idx}].ttl_s`) : undefined;
        return {
          ...(item.id !== undefined ? { id: item.id } : {}),
          pos,
          ...(item.kind !== undefined ? { kind: item.kind as MoteKind } : {}),
          ...(ttl !== undefined ? { ttl_s: ttl } : {})
        };
      }
      throw new ContractValidationError(`scenario.motes[${idx}] must be [x,y,z] or {pos}`);
    });
  }

  if (root.shades !== undefined) {
    if (!Array.isArray(root.shades)) {
      throw new ContractValidationError('scenario.shades must be an array');
    }
    out.shades = root.shades.map((item, idx) => {
      if (!isPlainObject(item)) {
        throw new ContractValidationError(`scenario.shades[${idx}] must be an object`);
      }
      const pos = assertVec3(item.pos, `scenario.shades[${idx}].pos`);
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractValidationError(`scenario.shades[${idx}].id must be a string`);
      }
      if (item.state !== undefined && (typeof item.state !== 'string' || !VALID_SHADE_STATES.has(item.state as ShadeBehaviorState))) {
        throw new ContractValidationError(`scenario.shades[${idx}].state invalid`);
      }
      const ticksLeft =
        item.state_ticks_left !== undefined
          ? assertNonNegInt(item.state_ticks_left, `scenario.shades[${idx}].state_ticks_left`)
          : undefined;
      if (item.target_lantern_id !== undefined && typeof item.target_lantern_id !== 'string') {
        throw new ContractValidationError(`scenario.shades[${idx}].target_lantern_id must be a string`);
      }
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(item.state !== undefined ? { state: item.state as ShadeBehaviorState } : {}),
        ...(ticksLeft !== undefined ? { state_ticks_left: ticksLeft } : {}),
        ...(item.target_lantern_id !== undefined ? { target_lantern_id: item.target_lantern_id } : {})
      };
    });
  }

  if (root.drifters !== undefined) {
    if (!Array.isArray(root.drifters)) {
      throw new ContractValidationError('scenario.drifters must be an array');
    }
    out.drifters = root.drifters.map((item, idx) => {
      if (!isPlainObject(item)) {
        throw new ContractValidationError(`scenario.drifters[${idx}] must be an object`);
      }
      const pos = assertVec3(item.pos, `scenario.drifters[${idx}].pos`);
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractValidationError(`scenario.drifters[${idx}].id must be a string`);
      }
      if (item.state !== undefined && (typeof item.state !== 'string' || !VALID_DRIFTER_STATES.has(item.state as DrifterBehaviorState))) {
        throw new ContractValidationError(`scenario.drifters[${idx}].state invalid`);
      }
      const stolen = item.stolen !== undefined ? assertNonNegInt(item.stolen, `scenario.drifters[${idx}].stolen`) : undefined;
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(item.state !== undefined ? { state: item.state as DrifterBehaviorState } : {}),
        ...(stolen !== undefined ? { stolen } : {})
      };
    });
  }

  if (root.charms !== undefined) {
    if (!Array.isArray(root.charms)) {
      throw new ContractValidationError('scenario.charms must be an array');
    }
    out.charms = root.charms.map((item, idx) => {
      if (!isPlainObject(item) || typeof item.id !== 'string') {
        throw new ContractValidationError(`scenario.charms[${idx}].id must be a string`);
      }
      const res: NonNullable<ScenarioConfig['charms']>[number] = { id: item.id };
      if (item.pos !== undefined) res.pos = assertVec3(item.pos, `scenario.charms[${idx}].pos`);
      if (item.available !== undefined) {
        if (typeof item.available !== 'boolean') {
          throw new ContractValidationError(`scenario.charms[${idx}].available must be a boolean`);
        }
        res.available = item.available;
      }
      if (item.respawn_s !== undefined) {
        const rs = assertFiniteNumber(item.respawn_s, `scenario.charms[${idx}].respawn_s`);
        if (rs < 0) throw new ContractValidationError(`scenario.charms[${idx}].respawn_s must be >= 0`);
        res.respawn_s = rs;
      }
      return res;
    });
  }

  if (root.lanterns !== undefined) {
    if (!Array.isArray(root.lanterns)) {
      throw new ContractValidationError('scenario.lanterns must be an array');
    }
    out.lanterns = root.lanterns.map((item, idx) => {
      if (!isPlainObject(item) || typeof item.id !== 'string') {
        throw new ContractValidationError(`scenario.lanterns[${idx}].id must be a string`);
      }
      const res: NonNullable<ScenarioConfig['lanterns']>[number] = { id: item.id };
      if (item.pos !== undefined) res.pos = assertVec3(item.pos, `scenario.lanterns[${idx}].pos`);
      if (item.deposited !== undefined) res.deposited = assertNonNegInt(item.deposited, `scenario.lanterns[${idx}].deposited`);
      if (item.lit !== undefined) {
        if (typeof item.lit !== 'boolean') {
          throw new ContractValidationError(`scenario.lanterns[${idx}].lit must be a boolean`);
        }
        res.lit = item.lit;
      }
      if (item.fuel !== undefined) {
        const fv = assertFiniteNumber(item.fuel, `scenario.lanterns[${idx}].fuel`);
        if (fv < 0 || fv > 100) {
          throw new ContractValidationError(`scenario.lanterns[${idx}].fuel must be in [0, 100]`);
        }
        res.fuel = fv;
      }
      if (item.ever_lit !== undefined) {
        if (typeof item.ever_lit !== 'boolean') {
          throw new ContractValidationError(`scenario.lanterns[${idx}].ever_lit must be a boolean`);
        }
        res.ever_lit = item.ever_lit;
      }
      return res;
    });
  }

  return out;
}
