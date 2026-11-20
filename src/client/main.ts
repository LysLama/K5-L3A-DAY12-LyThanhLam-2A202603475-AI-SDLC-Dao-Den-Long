import './style.css';
import * as THREE from 'three';
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
    this.mountEl.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      250
    );
    this.camRig = new ThirdPersonCamera(this.renderer.domElement);

    this.state = createWorld(SEED_BASE);
    this.worldScene = new IslandScene(this.state);

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
      this.rightPulseQueued = true;
    };

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('resize', this.onResize);

    this.hud.update(this.state, this.paused);
    this.startLoop();
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
    this.hud.setPaused(false, this.state.status);
    this.hud.update(this.state, this.paused);
  }

  private startLoop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.lastTimestamp = performance.now();
    const tickFrame = (now: number) => {
      const frameDt = Math.min(0.1, (now - this.lastTimestamp) / 1000);
      this.lastTimestamp = now;

      let tickEvents: SimEvent[] = [];
      if (!this.paused && this.state.status === 'playing') {
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
        this.audio.handleEvents(tickEvents);
      }

      this.worldScene.sync(this.state, tickEvents, this.elapsedSec);
      this.camRig.update(this.camera, this.state.player.pos, this.pressedKeys, frameDt);
      this.hud.update(this.state, this.paused);
      this.renderer.render(this.worldScene.scene, this.camera);

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
    this.audio.dispose();
    this.renderer.dispose();
  }
}

const root = document.getElementById('app');
if (root) {
  const app = new GameApp(root);
  window.addEventListener('beforeunload', () => app.dispose());
}
