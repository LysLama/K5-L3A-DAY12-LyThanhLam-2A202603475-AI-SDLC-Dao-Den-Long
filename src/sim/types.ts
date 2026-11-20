export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type NightId = 1 | 2 | 3;

export type GameStatus = 'playing' | 'paused' | 'won' | 'lost';
export type ShadeBehaviorState = 'spawning' | 'wander' | 'chase' | 'recoil' | 'stunned';
export type DrifterBehaviorState = 'idle' | 'chase' | 'flee';
export type MoteKind = 'random' | 'dropped';

export interface InputState {
  move: Vec2;
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
}

export interface InputFrame {
  tick: number;
  move?: Vec2;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
  pause?: boolean;
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
  invuln_ticks?: number;
  dash_cd_ticks?: number;
  pulse_cd_ticks?: number;
  charm_ticks?: number;
}

export interface ScenarioMoteObj {
  id?: string;
  pos: Vec3;
  kind?: MoteKind;
  ttl_s?: number;
}

export interface ScenarioShadeObj {
  id?: string;
  pos: Vec3;
  state?: ShadeBehaviorState;
  state_ticks_left?: number;
}

export interface ScenarioLanternObj {
  id: string;
  pos?: Vec3;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioDrifterObj {
  id?: string;
  pos: Vec3;
  state?: DrifterBehaviorState;
  stolen?: number;
}

export interface ScenarioCharmObj {
  id: string;
  pos?: Vec3;
  available?: boolean;
  respawn_s?: number;
}

export interface ScenarioConfig {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: Array<Vec3 | ScenarioMoteObj>;
  shades?: ScenarioShadeObj[];
  lanterns?: ScenarioLanternObj[];
  drifters?: ScenarioDrifterObj[];
  charms?: ScenarioCharmObj[];
  time_left_s?: number;
}

export interface PlayerState {
  pos: Vec3;
  vel: Vec3;
  grounded: boolean;
  launched: boolean;
  facing: Vec2;
  flames: number;
  carried: number;
  invulnTicks: number;
  dashTicksLeft: number;
  dashDir: Vec2;
  dashCdTicks: number;
  pulseCdTicks: number;
  charmTicks: number;
  fallWaitTicks: number;
}

export interface LanternState {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export interface MoteState {
  id: string;
  pos: Vec3;
  kind: MoteKind;
  ttlTicks: number | null;
  createdTick: number;
}

export interface ShadeState {
  id: string;
  pos: Vec3;
  state: ShadeBehaviorState;
  stateTicksLeft: number;
  pushTicksLeft: number;
  pushDir: Vec2;
  recoilDir: Vec2;
  safePushTicksLeft: number;
  wanderDir: Vec2;
  wanderTimerTicks: number;
  createdTick: number;
}

export interface DrifterState {
  id: string;
  pos: Vec3;
  state: DrifterBehaviorState;
  stolen: number;
  hasStolen: boolean;
  stateTicksLeft: number;
  wanderAngle: number;
  createdTick: number;
}

export interface CharmState {
  id: string;
  pos: Vec3;
  available: boolean;
  respawnTicks: number;
}

export interface WindState {
  enabled: boolean;
  active: boolean;
  warning: boolean;
  dirDeg: number;
  cycleTick: number;
}

export interface SimState {
  seed: number;
  night: NightId;
  rng: () => number;
  tick: number;
  simTick: number;
  status: GameStatus;
  initialTimeLeftS: number;
  timeLeftS: number;
  score: number;
  randomMotes: boolean;
  randomShades: boolean;
  randomDrifters: boolean;
  initialShadeSpawned: boolean;
  nextShadeSpawnTick: number;
  nextMoteSeq: number;
  nextShadeSeq: number;
  nextDrifterSeq: number;
  playerSpawnPos: Vec3;
  playerSpawnFacing: Vec2;
  player: PlayerState;
  lanterns: LanternState[];
  motes: MoteState[];
  shades: ShadeState[];
  drifters: DrifterState[];
  charms: CharmState[];
  wind: WindState;
  prevButtons: {
    jump: boolean;
    interact: boolean;
    pulse: boolean;
    dash: boolean;
    pause: boolean;
  };
}

export type SimEvent =
  | { type: 'event'; tick: number; name: 'night_start'; data: { night: NightId } }
  | { type: 'event'; tick: number; name: 'mote_picked'; data: { carried: number } }
  | { type: 'event'; tick: number; name: 'deposit'; data: { lantern_id: string; amount: number; deposited: number } }
  | { type: 'event'; tick: number; name: 'lantern_lit'; data: { lantern_id: string } }
  | { type: 'event'; tick: number; name: 'pulse'; data: { stunned_ids: string[] } }
  | { type: 'event'; tick: number; name: 'dash'; data: Record<string, never> }
  | { type: 'event'; tick: number; name: 'charm_picked'; data: { charm_id: string; charm_ticks: number } }
  | { type: 'event'; tick: number; name: 'drifter_steal'; data: { drifter_id: string; amount: number; carried: number } }
  | { type: 'event'; tick: number; name: 'drifter_drop'; data: { drifter_id: string; amount: number } }
  | { type: 'event'; tick: number; name: 'player_hit'; data: { by: 'shade' | 'fall'; flames: number; dropped: number; lost?: number } }
  | { type: 'event'; tick: number; name: 'shade_spawned'; data: { id: string } }
  | { type: 'event'; tick: number; name: 'paused'; data: Record<string, never> }
  | { type: 'event'; tick: number; name: 'resumed'; data: Record<string, never> }
  | { type: 'event'; tick: number; name: 'game_over'; data: { result: 'won' | 'lost'; reason: 'all_lit' | 'dawn' | 'no_flames' } };

export interface SimSnapshot {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  night: NightId;
  state: GameStatus;
  time_left_s: number;
  score: number;
  wind: {
    active: boolean;
    dir_deg: number;
  };
  player: {
    pos: Vec3;
    vel: Vec3;
    grounded: boolean;
    flames: number;
    carried: number;
    invuln: boolean;
    dash_cd_s: number;
    pulse_cd_s: number;
    charm_s: number;
  };
  lanterns: Array<{
    id: string;
    pos: Vec3;
    lit: boolean;
    deposited: number;
  }>;
  shades: Array<{
    id: string;
    pos: Vec3;
    state: ShadeBehaviorState;
  }>;
  motes: Array<{
    id: string;
    pos: Vec3;
    kind: MoteKind;
    ttl_s: number | null;
  }>;
  motes_active: number;
  drifters: Array<{
    id: string;
    pos: Vec3;
    state: DrifterBehaviorState;
    stolen: number;
  }>;
  charms: Array<{
    id: string;
    available: boolean;
    respawn_s: number;
  }>;
}

export interface SimEnd {
  type: 'end';
  ticks: number;
  state: GameStatus;
  score: number;
}
