import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DT } from '../sim/constants';
import { stepTick } from '../sim/step';
import type { SimEvent, SimState } from '../sim/types';
import { createWorld } from '../sim/world';
import { Soundscape } from './audio';
import { ThirdPersonCamera } from './camera';
import { HudController } from './hud';
import { mapKeysToInput } from './inputMapper';
import { IslandScene } from './sceneBuilder';

const SEED_BASE = 20261120;

class GameApp {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly camRig: ThirdPersonCamera;
  private readonly audio = new Soundscape();
  private readonly hud: HudController;
  private readonly pressedKeys = new Set<string>();

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private state: SimState;
  private worldScene: IslandScene;
  private paused = false;
  private rightPulseQueued = false;
  private accumulator = 0;
  private lastTimestamp = 0;
  private elapsedSec = 0;
  private rafId: number | null = null;
  private runCount = 0;

  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onContextMenu: (e: MouseEvent) => void;
  private readonly onResize: () => void;

  constructor(private readonly mountEl: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.mountEl.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      56,
      window.innerWidth / window.innerHeight,
      0.1,
      260
    );
    this.camRig = new ThirdPersonCamera(this.renderer.domElement);

    this.state = createWorld(SEED_BASE);
    this.worldScene = new IslandScene(this.state);
    this.setupComposer();

    this.hud = new HudController(
      () => this.restart(),
      () => this.togglePause(),
      () => this.audio.toggleMute()
    );

    this.onKeyDown = (e: KeyboardEvent) => {
      this.audio.unlock();
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.state.status === 'playing') this.togglePause();
        return;
      }
      if (e.code === 'KeyM') {
        this.hud.setMuted(this.audio.toggleMute());
        return;
      }
      if (e.code === 'KeyH') {
        this.hud.toggleHelp();
        return;
      }
      if (e.code === 'Enter' && this.state.status !== 'playing') {
        this.restart();
        return;
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
      if (!this.paused && this.state.status === 'playing') {
        this.rightPulseQueued = true;
      }
    };

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer?.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('resize', this.onResize);

    this.hud.update(this.state, this.paused, 0);
    this.startLoop();
  }

  private setupComposer(): void {
    try {
      const composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.worldScene.scene, this.camera);
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.42,
        0.45,
        0.72
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

  private togglePause(): void {
    this.paused = !this.paused;
    this.hud.setPaused(this.paused, this.state.status);
  }

  restart(): void {
    this.runCount += 1;
    this.paused = false;
    this.accumulator = 0;
    this.rightPulseQueued = false;
    this.pressedKeys.clear();
    this.camRig.reset();
    this.worldScene.dispose();
    this.state = createWorld(SEED_BASE + this.runCount);
    this.worldScene = new IslandScene(this.state);
    if (this.renderPass) {
      this.renderPass.scene = this.worldScene.scene;
    }
    this.hud.setPaused(false, this.state.status);
    this.hud.update(this.state, this.paused, 0);
  }

  private startLoop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.lastTimestamp = performance.now();
    const tickFrame = (now: number) => {
      const frameDt = Math.max(0, Math.min(0.1, (now - this.lastTimestamp) / 1000));
      this.lastTimestamp = now;

      let tickEvents: SimEvent[] = [];
      let simDt = 0;
      if (!this.paused && this.state.status === 'playing') {
        simDt = frameDt;
        this.elapsedSec += frameDt;
        this.accumulator += frameDt;
        while (this.accumulator >= DT && this.state.status === 'playing') {
          const input = mapKeysToInput(
            this.pressedKeys,
            this.camRig.yawDeg,
            this.rightPulseQueued
          );
          this.rightPulseQueued = false;
          const evs = stepTick(this.state, input);
          if (evs.length > 0) tickEvents = tickEvents.concat(evs);
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
      }

      this.worldScene.sync(this.state, tickEvents, this.elapsedSec, simDt);
      this.camRig.update(this.camera, this.state.player.pos, this.pressedKeys, frameDt);
      this.hud.update(this.state, this.paused, frameDt);

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
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.onResize);
    this.camRig.dispose();
    this.worldScene.dispose();
    this.composer?.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }
}

const root = document.getElementById('app');
if (root) {
  const app = new GameApp(root);
  window.addEventListener('beforeunload', () => app.dispose());
}
