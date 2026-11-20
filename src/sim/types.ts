export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export type GameStatus = 'playing' | 'won' | 'lost';
export type ShadeBehaviorState = 'chase' | 'stunned';

export interface InputState {
  move: Vec2;
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
}

export interface InputFrame {
  tick: number;
  move?: Vec2;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
}

export interface ScenarioMoteObj {
  id?: string;
  pos: Vec3;
}

export interface ScenarioShadeObj {
  id?: string;
  pos: Vec3;
  state?: ShadeBehaviorState;
}

export interface ScenarioLanternObj {
  id: string;
  pos?: Vec3;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioConfig {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: Array<Vec3 | ScenarioMoteObj>;
  shades?: ScenarioShadeObj[];
  lanterns?: ScenarioLanternObj[];
  time_left_s?: number;
}

export interface PlayerState {
  pos: Vec3;
  vy: number;
  facing: Vec2;
  flames: number;
  carried: number;
  invulnRemaining: number;
  pulseCooldownRemaining: number;
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
}

export interface ShadeState {
  id: string;
  pos: Vec3;
  state: ShadeBehaviorState;
  stunRemaining: number;
}

export interface SimState {
  seed: number;
  rng: () => number;
  tick: number;
  simTick: number;
  status: GameStatus;
  initialTimeLeftS: number;
  timeLeftS: number;
  score: number;
  randomMotes: boolean;
  randomShades: boolean;
  moteSpawnTimerTicks: number;
  shadeSpawnTimerTicks: number;
  nextMoteSeq: number;
  nextShadeSeq: number;
  player: PlayerState;
  lanterns: LanternState[];
  motes: MoteState[];
  shades: ShadeState[];
  prevButtons: {
    jump: boolean;
    interact: boolean;
    pulse: boolean;
    dash: boolean;
  };
}

export type SimEvent =
  | { type: 'event'; tick: number; name: 'mote_picked'; data: { carried: number } }
  | { type: 'event'; tick: number; name: 'deposit'; data: { lantern_id: string; amount: number; deposited: number } }
  | { type: 'event'; tick: number; name: 'lantern_lit'; data: { lantern_id: string } }
  | { type: 'event'; tick: number; name: 'pulse'; data: { stunned_ids: string[] } }
  | { type: 'event'; tick: number; name: 'player_hit'; data: { by: 'shade' | 'fall'; flames: number; dropped: number } }
  | { type: 'event'; tick: number; name: 'shade_spawned'; data: { id: string } }
  | { type: 'event'; tick: number; name: 'game_over'; data: { result: 'won' | 'lost'; reason: 'all_lit' | 'dawn' | 'no_flames' } };

export interface SimSnapshot {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  state: GameStatus;
  time_left_s: number;
  score: number;
  player: {
    pos: Vec3;
    flames: number;
    carried: number;
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
  }>;
  motes_active: number;
}

export interface SimEnd {
  type: 'end';
  ticks: number;
  state: GameStatus;
  score: number;
}
