import type { InputFrame, ScenarioConfig, Vec2, Vec3 } from '../sim/types';

export class ContractValidationError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ContractValidationError(`${label} must be a finite number`);
  }
  return v;
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
    const tick = assertFiniteNumber(raw.tick, `frames[${i}].tick`);
    if (!Number.isInteger(tick) || tick < 0) {
      throw new ContractValidationError(`frames[${i}].tick must be a non-negative integer`);
    }
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
    for (const key of ['jump', 'interact', 'pulse', 'dash'] as const) {
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
    if (root.player.pos !== undefined) {
      out.player.pos = assertVec3(root.player.pos, 'scenario.player.pos');
    }
    if (root.player.carried !== undefined) {
      const carried = assertFiniteNumber(root.player.carried, 'scenario.player.carried');
      if (!Number.isInteger(carried) || carried < 0) {
        throw new ContractValidationError('scenario.player.carried must be a non-negative integer');
      }
      out.player.carried = carried;
    }
    if (root.player.flames !== undefined) {
      const flames = assertFiniteNumber(root.player.flames, 'scenario.player.flames');
      if (!Number.isInteger(flames) || flames < 0) {
        throw new ContractValidationError('scenario.player.flames must be a non-negative integer');
      }
      out.player.flames = flames;
    }
  }

  if (root.random_motes !== undefined) {
    if (typeof root.random_motes !== 'boolean') {
      throw new ContractValidationError('scenario.random_motes must be a boolean');
    }
    out.random_motes = root.random_motes;
  }

  if (root.random_shades !== undefined) {
    if (typeof root.random_shades !== 'boolean') {
      throw new ContractValidationError('scenario.random_shades must be a boolean');
    }
    out.random_shades = root.random_shades;
  }

  if (root.time_left_s !== undefined) {
    const t = assertFiniteNumber(root.time_left_s, 'scenario.time_left_s');
    if (t <= 0) {
      throw new ContractValidationError('scenario.time_left_s must be > 0');
    }
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
        return item.id !== undefined ? { id: item.id, pos } : { pos };
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
      if (item.state !== undefined && item.state !== 'chase' && item.state !== 'stunned') {
        throw new ContractValidationError(
          `scenario.shades[${idx}].state must be "chase" or "stunned"`
        );
      }
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(item.state !== undefined ? { state: item.state } : {})
      };
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
      if (item.deposited !== undefined) {
        const dep = assertFiniteNumber(item.deposited, `scenario.lanterns[${idx}].deposited`);
        if (!Number.isInteger(dep) || dep < 0) {
          throw new ContractValidationError(
            `scenario.lanterns[${idx}].deposited must be a non-negative integer`
          );
        }
        res.deposited = dep;
      }
      if (item.lit !== undefined) {
        if (typeof item.lit !== 'boolean') {
          throw new ContractValidationError(`scenario.lanterns[${idx}].lit must be a boolean`);
        }
        res.lit = item.lit;
      }
      return res;
    });
  }

  return out;
}
