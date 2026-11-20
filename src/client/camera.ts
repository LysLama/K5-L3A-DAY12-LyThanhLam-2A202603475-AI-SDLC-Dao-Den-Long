import * as THREE from 'three';
import type { Vec2, Vec3 } from '../sim/types';

export class ThirdPersonCamera {
  yawDeg = 0;
  sensitivity = 1.0;
  private pitchDeg = 24;
  private distance = 12.5;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private currentPos = new THREE.Vector3(0, 7, -12.5);
  private currentTarget = new THREE.Vector3(0, 1.4, 0);
  private shakeTime = 0;
  private shakeIntensity = 0;

  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onMouseUp: () => void;
  private readonly onWheel: (e: WheelEvent) => void;

  constructor(private readonly domElement: HTMLElement) {
    this.onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    };
    this.onMouseMove = (e: MouseEvent) => {
      const pointerLocked = document.pointerLockElement === this.domElement;
      if (!this.dragging && !pointerLocked) return;
      const dx = pointerLocked ? e.movementX : e.clientX - this.lastX;
      const dy = pointerLocked ? e.movementY : e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yawDeg -= dx * 0.35 * this.sensitivity;
      this.pitchDeg = Math.max(10, Math.min(55, this.pitchDeg + dy * 0.25 * this.sensitivity));
    };
    this.onMouseUp = () => {
      this.dragging = false;
    };
    this.onWheel = (e: WheelEvent) => {
      this.distance = Math.max(7.5, Math.min(20, this.distance + e.deltaY * 0.01));
    };

    this.domElement.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: true });
  }

  setSensitivity(sens: number): void {
    this.sensitivity = Math.max(0.3, Math.min(2.5, sens));
  }

  reset(spawnPos: Vec3 = [0, 0, 0], spawnFacing: Vec2 = [0, 1]): void {
    this.yawDeg = (Math.atan2(spawnFacing[0], spawnFacing[1]) * 180) / Math.PI;
    this.pitchDeg = 24;
    this.distance = 12.5;
    this.shakeTime = 0;
    this.shakeIntensity = 0;

    const yawRad = (this.yawDeg * Math.PI) / 180;
    const pitchRad = (this.pitchDeg * Math.PI) / 180;
    const horizDist = this.distance * Math.cos(pitchRad);
    const vertDist = this.distance * Math.sin(pitchRad) + 1.4;
    const fx = Math.sin(yawRad);
    const fz = Math.cos(yawRad);

    this.currentPos.set(
      spawnPos[0] - fx * horizDist,
      spawnPos[1] + vertDist,
      spawnPos[2] - fz * horizDist
    );
    this.currentTarget.set(spawnPos[0] + fx * 1.4, spawnPos[1] + 1.35, spawnPos[2] + fz * 1.4);
  }

  triggerShake(intensity: number, duration = 0.25): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  update(camera: THREE.PerspectiveCamera, playerPos: Vec3, pressedKeys: ReadonlySet<string>, dt: number): void {
    const keyTurnSpeed = 110 * Math.max(0.6, Math.min(1.8, this.sensitivity)); // deg/s
    if (pressedKeys.has('ArrowRight')) this.yawDeg -= keyTurnSpeed * dt;
    if (pressedKeys.has('ArrowLeft')) this.yawDeg += keyTurnSpeed * dt;

    const yawRad = (this.yawDeg * Math.PI) / 180;
    const pitchRad = (this.pitchDeg * Math.PI) / 180;

    const horizDist = this.distance * Math.cos(pitchRad);
    const vertDist = this.distance * Math.sin(pitchRad) + 1.4;

    const forwardX = Math.sin(yawRad);
    const forwardZ = Math.cos(yawRad);

    const desiredPos = new THREE.Vector3(
      playerPos[0] - forwardX * horizDist,
      Math.max(playerPos[1] + 1.2, playerPos[1] + vertDist),
      playerPos[2] - forwardZ * horizDist
    );
    const desiredTarget = new THREE.Vector3(
      playerPos[0] + forwardX * 1.4,
      playerPos[1] + 1.35,
      playerPos[2] + forwardZ * 1.4
    );

    const alpha = 1 - Math.exp(-12 * dt);
    this.currentPos.lerp(desiredPos, alpha);
    this.currentTarget.lerp(desiredTarget, alpha);

    camera.position.copy(this.currentPos);
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const decay = this.shakeTime * 4 * this.shakeIntensity;
      camera.position.x += Math.sin(this.shakeTime * 75) * decay;
      camera.position.y += Math.cos(this.shakeTime * 90) * decay * 0.6;
      if (this.shakeTime === 0) this.shakeIntensity = 0;
    }
    camera.lookAt(this.currentTarget);
  }

  dispose(): void {
    this.domElement.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
  }
}
