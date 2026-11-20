import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DT } from '../sim/constants';
import { getMapConfig } from '../sim/maps';
import { stepTick } from '../sim/step';
import type { InputState, NightId, SimEvent, SimState, Vec3 } from '../sim/types';
import { createBenchWorld, createWorld } from '../sim/world';
import { Soundscape } from './audio';
import { computeBenchCameraPosition } from './benchOrbit';
import { ThirdPersonCamera } from './camera';
import { type GameSettings, HudController, type UiScreen } from './hud';
import { mapKeysToInput } from './inputMapper';
import { IslandScene } from './sceneBuilder';

const SEED_BASE = 20261120;
const SETTINGS_KEY = 'ddl_settings_v2';

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(100, parsed.volume)) : 75,
        sensitivity:
          typeof parsed.sensitivity === 'number'
            ? Math.max(40, Math.min(200, parsed.sensitivity))
            : 100,
        colorblind: typeof parsed.colorblind === 'boolean' ? parsed.colorblind : false
      };
    }
  } catch {
    // ignore storage restriction
  }
  return { volume: 75, sensitivity: 100, colorblind: false };
}

function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage restriction
  }
}

class GameApp {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly camRig: ThirdPersonCamera;
  private readonly audio = new Soundscape();
  private readonly hud: HudController;
  private readonly pressedKeys = new Set<string>();

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;

  private settings: GameSettings = loadSettings();
  private screen: UiScreen = 'menu';
  private campaignMode = true;
  private campaignScores: Partial<Record<NightId, number>> = {};
  private currentNight: NightId = 1;

  private state: SimState;
  private prevPlayerPos: Vec3;
  private prevShadePositions = new Map<string, Vec3>();
  private prevDrifterPositions = new Map<string, Vec3>();
  private worldScene: IslandScene;

  private rightPulseQueued = false;
  private accumulator = 0;
  private lastTimestamp = 0;
  private elapsedSec = 0;
  private rafId: number | null = null;
  private runCount = 0;

  private prevWindWarning = false;
  private prevWindActive = false;
  private lastCountdownSec = -1;

  private dtSamples: number[] = [];
  private fpsAvg = 60;

  private readonly benchConfig: { active: boolean; seed: number; durationS: number };
  private benchReadySent = false;
  private benchSubmitted = false;
  private benchStartPerfMs = 0;
  private benchMeasureStartMs = 0;
  private benchPrevFrameMs = 0;
  private readonly benchDtsMs: number[] = [];

  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onContextMenu: (e: MouseEvent) => void;
  private readonly onResize: () => void;
  private readonly onBlur: () => void;

  constructor(private readonly mountEl: HTMLElement) {
    const params = new URLSearchParams(window.location.search);
    this.benchConfig = {
      active: params.get('bench') === '1',
      seed: Number.parseInt(params.get('seed') ?? '42', 10) || 42,
      durationS: Math.max(1, Number.parseFloat(params.get('duration') ?? '30') || 30)
    };

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.mountEl.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      56,
      window.innerWidth / window.innerHeight,
      0.1,
      280
    );
    this.camRig = new ThirdPersonCamera(this.renderer.domElement);

    this.audio.setVolume(this.settings.volume / 100);
    this.camRig.setSensitivity(this.settings.sensitivity / 100);

    this.state = this.benchConfig.active
      ? createBenchWorld(this.benchConfig.seed)
      : createWorld(SEED_BASE, undefined, 1);
    const mapCfg = getMapConfig(1);
    this.camRig.reset(mapCfg.spawnPos, mapCfg.spawnFacing);
    this.prevPlayerPos = [...this.state.player.pos];
    this.snapshotPrevActors();
    this.worldScene = new IslandScene(this.state);
    this.setupComposer();

    this.hud = new HudController(this.settings, {
      onStartCampaign: () => {
        this.audio.unlock();
        this.audio.playUiClick();
        this.campaignMode = true;
        this.campaignScores = {};
        this.loadNightIntoIntro(1);
      },
      onStartNight: (night) => {
        this.audio.unlock();
        this.audio.playUiClick();
        this.campaignMode = false;
        this.campaignScores = {};
        this.loadNightIntoIntro(night);
      },
      onBeginPlayFromIntro: () => {
        this.audio.unlock();
        this.audio.playUiClick();
        this.screen = 'playing';
        this.hud.showScreen('playing', this.currentNight);
        this.hud.update(this.state, 0, this.camera, true);
      },
      onBackToMenu: () => {
        this.audio.playUiClick();
        this.loadNightPreviewMenu();
      },
      onNextNight: () => {
        this.audio.playUiClick();
        if (this.currentNight < 3) {
          this.loadNightIntoIntro((this.currentNight + 1) as NightId);
        }
      },
      onRetryNight: () => {
        this.audio.unlock();
        this.audio.playUiClick();
        if (this.state.status === 'won' && this.currentNight === 3 && this.campaignMode) {
          this.campaignScores = {};
          this.loadNightIntoIntro(1);
        } else {
          this.startNightImmediate(this.currentNight);
        }
      },
      onTogglePause: () => this.togglePause(),
      onToggleMute: () => this.audio.toggleMute(),
      onChangeSettings: (next) => {
        this.settings = next;
        saveSettings(next);
        this.audio.setVolume(next.volume / 100);
        this.camRig.setSensitivity(next.sensitivity / 100);
      }
    });

    this.screen = this.benchConfig.active ? 'bench' : 'menu';
    this.hud.showScreen(this.screen, 1);

    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.benchConfig.active) return;
      this.audio.unlock();
      if (e.repeat && ['KeyP', 'Escape', 'KeyM', 'KeyH', 'Enter'].includes(e.code)) return;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.screen === 'playing' || this.screen === 'paused') {
          this.togglePause();
        }
        return;
      }
      if (e.code === 'KeyM') {
        this.hud.setMuted(this.audio.toggleMute());
        return;
      }
      if (e.code === 'KeyH') {
        if (this.screen === 'playing') this.hud.toggleHelp();
        return;
      }
      if (e.code === 'Enter') {
        if (this.screen === 'intro') {
          this.screen = 'playing';
          this.hud.showScreen('playing', this.currentNight);
          return;
        }
        if (this.screen === 'result') {
          if (this.state.status === 'won' && this.campaignMode && this.currentNight < 3) {
            this.loadNightIntoIntro((this.currentNight + 1) as NightId);
          } else if (this.state.status === 'won' && this.currentNight === 3 && this.campaignMode) {
            this.campaignScores = {};
            this.loadNightIntoIntro(1);
          } else {
            this.startNightImmediate(this.currentNight);
          }
          return;
        }
      }
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
      }
      this.pressedKeys.add(e.code);
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.pressedKeys.delete(e.code);
    };

    this.onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      this.audio.unlock();
      if (this.screen === 'playing' && this.state.status === 'playing') {
        this.rightPulseQueued = true;
      }
    };

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer?.setSize(window.innerWidth, window.innerHeight);
    };

    this.onBlur = () => {
      this.pressedKeys.clear();
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('resize', this.onResize);

    // Expose read-only telemetry hook for automated FPS/state QA without affecting sim
    (window as unknown as { __ddlDebug?: () => unknown }).__ddlDebug = () => ({
      fpsAvg: Math.round(this.fpsAvg * 10) / 10,
      screen: this.screen,
      night: this.currentNight,
      tick: this.state.tick,
      simTick: this.state.simTick,
      status: this.state.status,
      score: this.state.score,
      flames: this.state.player.flames,
      carried: this.state.player.carried
    });

    this.startLoop();
  }

  private setupComposer(): void {
    try {
      const composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.worldScene.scene, this.camera);
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.4,
        0.42,
        0.74
      );
      const outputPass = new OutputPass();
      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      composer.addPass(outputPass);
      this.composer = composer;
      this.renderPass = renderPass;
    } catch {
      this.composer = null;
      this.renderPass = null;
    }
  }

  private resetWorld(night: NightId): void {
    this.runCount += 1;
    this.currentNight = night;
    this.accumulator = 0;
    this.rightPulseQueued = false;
    this.pressedKeys.clear();
    this.prevWindWarning = false;
    this.prevWindActive = false;
    this.lastCountdownSec = -1;
    this.dtSamples = [];
    this.fpsAvg = 60;

    this.worldScene.dispose();
    this.state = createWorld(SEED_BASE + this.runCount + night * 97, undefined, night);
    const mapCfg = getMapConfig(night);
    this.camRig.reset(mapCfg.spawnPos, mapCfg.spawnFacing);
    this.prevPlayerPos = [...this.state.player.pos];
    this.snapshotPrevActors();
    this.worldScene = new IslandScene(this.state);
    if (this.renderPass) {
      this.renderPass.scene = this.worldScene.scene;
    }
  }

  private loadNightPreviewMenu(): void {
    this.resetWorld(1);
    this.screen = 'menu';
    this.hud.showScreen('menu', 1);
  }

  private loadNightIntoIntro(night: NightId): void {
    this.resetWorld(night);
    this.screen = 'intro';
    this.hud.showScreen('intro', night);
  }

  private startNightImmediate(night: NightId): void {
    this.resetWorld(night);
    this.screen = 'playing';
    this.hud.showScreen('playing', night);
    this.hud.update(this.state, 0, this.camera, true);
  }

  private togglePause(): void {
    if (this.screen !== 'playing' && this.screen !== 'paused') return;
    if (this.state.status === 'playing') {
      stepTick(this.state, mapKeysToInput(new Set(), this.camRig.yawDeg, false, true));
      // Release pause key immediately inside sim tracker so next press sees rising edge
      stepTick(this.state, mapKeysToInput(new Set(), this.camRig.yawDeg, false, false));
      this.screen = 'paused';
      this.pressedKeys.clear();
      this.hud.showScreen('paused', this.currentNight, this.fpsAvg);
    } else if (this.state.status === 'paused') {
      this.prevPlayerPos = [...this.state.player.pos];
      this.snapshotPrevActors();
      const resumeEvs1 = stepTick(this.state, mapKeysToInput(new Set(), this.camRig.yawDeg, false, true));
      let resumeEvs2: SimEvent[] = [];
      if ((this.state.status as SimState['status']) === 'playing') {
        this.prevPlayerPos = [...this.state.player.pos];
        this.snapshotPrevActors();
        resumeEvs2 = stepTick(this.state, mapKeysToInput(new Set(), this.camRig.yawDeg, false, false));
      }
      const combined = resumeEvs1.concat(resumeEvs2);
      if (combined.length > 0) {
        this.audio.handleEvents(combined);
        this.hud.handleEvents(combined, this.state);
      }
      this.accumulator = 0;
      this.lastTimestamp = performance.now();
      if (!this.handleTerminalState()) {
        this.screen = 'playing';
        this.hud.showScreen('playing', this.currentNight, this.fpsAvg);
      }
    }
  }

  private handleTerminalState(): boolean {
    if (this.state.status !== 'won' && this.state.status !== 'lost') return false;
    this.screen = 'result';
    if (this.state.status === 'won') {
      this.campaignScores[this.currentNight] = this.state.score;
    }
    const campaignTotal = Object.values(this.campaignScores).reduce(
      (sum, v) => sum + (v ?? 0),
      0
    );
    this.hud.renderResult(this.state, this.campaignMode, campaignTotal);
    return true;
  }

  private snapshotPrevActors(): void {
    this.prevShadePositions.clear();
    for (const s of this.state.shades) {
      this.prevShadePositions.set(s.id, [s.pos[0], s.pos[1], s.pos[2]]);
    }
    this.prevDrifterPositions.clear();
    for (const d of this.state.drifters) {
      this.prevDrifterPositions.set(d.id, [d.pos[0], d.pos[1], d.pos[2]]);
    }
  }

  private getWebglRendererDesc(): string {
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = dbg
        ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER));
      return `Three.js 0.187.0 (${gpu})`;
    } catch {
      return 'Three.js 0.187.0 (WebGL2)';
    }
  }

  private submitBenchResults(): void {
    this.benchSubmitted = true;
    const sumDt = this.benchDtsMs.reduce((a, b) => a + b, 0);
    const avgFps = sumDt > 0 ? (1000 * this.benchDtsMs.length) / sumDt : 0;
    const payload = {
      dtsMs: this.benchDtsMs,
      vsyncOff: avgFps > 64 || navigator.userAgent.includes('Electron'),
      renderer: this.getWebglRendererDesc()
    };
    void fetch('/api/bench-done', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .catch(() => {})
      .finally(() => {
        (window as unknown as { __ddlBenchDone?: boolean }).__ddlBenchDone = true;
      });
  }

  private startLoop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.lastTimestamp = performance.now();
    const neutralBenchInput: InputState = {
      move: [0, 0],
      cam_yaw_deg: 0,
      jump: false,
      interact: false,
      pulse: false,
      dash: false,
      pause: false
    };

    const tickFrame = (now: number) => {
      const rawDt = Math.max(0.0001, (now - this.lastTimestamp) / 1000);
      const frameDt = Math.min(0.1, rawDt);
      this.lastTimestamp = now;

      if (this.benchConfig.active) {
        if (!this.benchReadySent) {
          this.benchStartPerfMs = now;
        }
        const benchElapsedSec = (now - this.benchStartPerfMs) / 1000;
        this.elapsedSec = benchElapsedSec;
        this.accumulator = Math.min(this.accumulator + frameDt, DT * 4);
        while (this.accumulator >= DT) {
          this.prevPlayerPos = [0, 0, 0];
          this.snapshotPrevActors();
          stepTick(this.state, neutralBenchInput);
          this.accumulator -= DT;
        }

        const [bx, by, bz] = computeBenchCameraPosition(benchElapsedSec);
        this.camera.position.set(bx, by, bz);
        this.camera.lookAt(0, 0, 0);

        const alpha = this.accumulator / DT;
        this.worldScene.sync(this.state, [], {
          alpha,
          simDt: frameDt,
          frameDt,
          elapsedSec: this.elapsedSec,
          isMovingInput: false,
          colorblind: false,
          cameraPos: [bx, by, bz],
          prevPlayerPos: this.prevPlayerPos,
          prevShadePositions: this.prevShadePositions,
          prevDrifterPositions: this.prevDrifterPositions
        });

        if (this.composer) {
          this.composer.render();
        } else {
          this.renderer.render(this.worldScene.scene, this.camera);
        }

        if (!this.benchReadySent) {
          this.benchReadySent = true;
          void fetch('/api/bench-ready', { method: 'POST' }).catch(() => {});
        }

        const elapsedMs = now - this.benchStartPerfMs;
        if (elapsedMs >= 3000 && !this.benchSubmitted) {
          if (this.benchMeasureStartMs === 0) {
            this.benchMeasureStartMs = now;
            this.benchPrevFrameMs = now;
          } else {
            this.benchDtsMs.push(Math.max(0.05, now - this.benchPrevFrameMs));
            this.benchPrevFrameMs = now;
            if (now - this.benchMeasureStartMs >= this.benchConfig.durationS * 1000) {
              this.submitBenchResults();
            }
          }
        }

        if (!this.benchSubmitted) {
          this.rafId = requestAnimationFrame(tickFrame);
        }
        return;
      }

      let tickEvents: SimEvent[] = [];
      let simDt = 0;
      const liveInput = mapKeysToInput(this.pressedKeys, this.camRig.yawDeg, false, false);
      const isPlaying = this.screen === 'playing' && this.state.status === 'playing';
      const isMovingInput = isPlaying && (liveInput.move[0] !== 0 || liveInput.move[1] !== 0);

      // True windowed average FPS = frameCount / totalFrameTime (only steady playing frames)
      if (isPlaying && rawDt <= 0.15 && this.state.simTick > 10) {
        this.dtSamples.push(rawDt);
        if (this.dtSamples.length > 60) this.dtSamples.shift();
        const totalDt = this.dtSamples.reduce((a, b) => a + b, 0);
        if (totalDt > 0) this.fpsAvg = this.dtSamples.length / totalDt;
      }

      if (isPlaying) {
        simDt = frameDt;
        this.elapsedSec += frameDt;
        this.accumulator += frameDt;

        while (this.accumulator >= DT && this.state.status === 'playing') {
          this.prevPlayerPos = [
            this.state.player.pos[0],
            this.state.player.pos[1],
            this.state.player.pos[2]
          ];
          this.snapshotPrevActors();
          const wasGrounded = this.state.player.grounded;
          const prevWaitTicks = this.state.player.fallWaitTicks;

          const input = mapKeysToInput(
            this.pressedKeys,
            this.camRig.yawDeg,
            this.rightPulseQueued,
            false
          );
          this.rightPulseQueued = false;
          const evs = stepTick(this.state, input);

          if (wasGrounded && !this.state.player.grounded && this.state.player.vel[1] > 2) {
            this.audio.playJump();
          }
          if (prevWaitTicks > 0 && this.state.player.fallWaitTicks === 0) {
            this.prevPlayerPos = [...this.state.player.pos];
          }
          if (evs.length > 0) {
            tickEvents = tickEvents.concat(evs);
            if (evs.some((e) => e.name === 'player_hit' && e.data.by === 'fall')) {
              this.prevPlayerPos = [...this.state.player.pos];
            }
          }
          this.accumulator -= DT;
        }

        if (tickEvents.length > 0) {
          this.audio.handleEvents(tickEvents);
          this.hud.handleEvents(tickEvents, this.state);
          for (const ev of tickEvents) {
            if (ev.name === 'player_hit') this.camRig.triggerShake(0.32, 0.25);
            else if (ev.name === 'pulse') this.camRig.triggerShake(0.16, 0.18);
            else if (ev.name === 'lantern_lit') this.camRig.triggerShake(0.12, 0.2);
          }
        }

        // Wind audio cues
        if (this.state.wind.warning && !this.prevWindWarning) {
          this.audio.playWindCue(false);
        }
        if (this.state.wind.active && !this.prevWindActive) {
          this.audio.playWindCue(true);
        }
        this.prevWindWarning = this.state.wind.warning;
        this.prevWindActive = this.state.wind.active;

        // Final 10s gentle countdown tick
        const ceilSec = Math.ceil(this.state.timeLeftS);
        if (ceilSec <= 10 && ceilSec >= 1 && ceilSec !== this.lastCountdownSec) {
          this.lastCountdownSec = ceilSec;
          this.audio.playCountdownTick(ceilSec);
        }

        // Check win / loss completion
        this.handleTerminalState();
      } else if (this.screen === 'menu' || this.screen === 'intro') {
        this.elapsedSec += frameDt;
        this.camRig.yawDeg = (this.camRig.yawDeg + frameDt * 7.5) % 360;
      }

      const alpha = isPlaying ? this.accumulator / DT : 1;
      const renderPlayerPos = this.worldScene.sync(this.state, tickEvents, {
        alpha,
        simDt,
        frameDt,
        elapsedSec: this.elapsedSec,
        isMovingInput,
        colorblind: this.settings.colorblind,
        cameraPos: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        prevPlayerPos: this.prevPlayerPos,
        prevShadePositions: this.prevShadePositions,
        prevDrifterPositions: this.prevDrifterPositions
      });

      this.camRig.update(this.camera, renderPlayerPos, isPlaying ? this.pressedKeys : new Set(), frameDt);
      this.hud.update(this.state, frameDt, this.camera, this.screen === 'playing' || this.screen === 'paused');

      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.worldScene.scene, this.camera);
      }

      this.rafId = requestAnimationFrame(tickFrame);
    };
    this.rafId = requestAnimationFrame(tickFrame);
  }

  dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.onResize);
    this.camRig.dispose();
    this.worldScene.dispose();
    this.audio.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

const root = document.getElementById('app');
if (root) {
  new GameApp(root);
}
