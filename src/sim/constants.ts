import type { Vec3 } from './types';

export const ISLAND_RADIUS = 36.0;
export const FOG_BOUND_RADIUS = 45.0;
export const DT = 1 / 60;

export const JUMP_VELOCITY = 6.5;
export const GRAVITY = -18.0;
export const FALL_VOID_Y = -4.0;

export const INITIAL_MOTE_COUNT = 28;
export const MAX_ACTIVE_MOTES = 28;
export const MAX_WORLD_MOTES_BUDGET = 35;
export const MOTE_RESPAWN_TICKS = 300; // 5s

export const INITIAL_SHADE_COUNT = 3;
export const MAX_ACTIVE_SHADES = 6;
export const SHADE_RESPAWN_TICKS = 1500; // 25s
export const SHADE_DEFAULT_Y = 1.0;

export const TUNING = {
  player_speed: 7.0,
  carry_capacity: 10,
  lantern_cost: 4,
  lantern_count_night1: 5,
  pickup_radius: 1.8,
  interact_radius: 2.8,
  pulse_cost: 2,
  pulse_radius: 7.5,
  night1_duration_s: 240,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2.5,
  pulse_push_m: 5.0,
  pulse_cooldown_s: 3.0,
  safe_radius: 5.5,
  shade_speed: 4.2,
  shade_hit_radius: 1.2,
  fall_enabled: true,
  score: {
    per_mote: 10,
    per_lantern: 150,
    per_stun: 25,
    per_second_left: 5,
    per_flame_left: 100
  }
} as const;

export const DEFAULT_LANTERN_POSITIONS: ReadonlyArray<{ id: string; pos: Vec3 }> = [
  { id: 'L1', pos: [0, 0, 22] },
  { id: 'L2', pos: [20.923, 0, 6.798] },
  { id: 'L3', pos: [12.931, 0, -17.798] },
  { id: 'L4', pos: [-12.931, 0, -17.798] },
  { id: 'L5', pos: [-20.923, 0, 6.798] }
];
