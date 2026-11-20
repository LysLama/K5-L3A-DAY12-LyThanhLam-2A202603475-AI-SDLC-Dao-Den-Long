import * as THREE from 'three';
import type { Vec3 } from '../sim/types';

export class ThirdPersonCamera {
  yawDeg = 0;
  private pitchDeg = 24;
  private distance = 12.5;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private currentPos = new THREE.Vector3(0, 7, -12.5);
  private currentTarget = new THREE.Vector3(0, 1.4, 0);

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
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yawDeg -= dx * 0.35;
      this.pitchDeg = Math.max(10, Math.min(55, this.pitchDeg + dy * 0.25));
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

  reset(): void {
    this.yawDeg = 0;
    this.pitchDeg = 24;
    this.distance = 12.5;
    this.currentPos.set(0, 7, -12.5);
    this.currentTarget.set(0, 1.4, 0);
  }

  update(camera: THREE.PerspectiveCamera, playerPos: Vec3, pressedKeys: ReadonlySet<string>, dt: number): void {
    const keyTurnSpeed = 110; // deg/s
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
      Math.max(1.2, playerPos[1] + vertDist),
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
    camera.lookAt(this.currentTarget);
  }

  dispose(): void {
    this.domElement.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
  }
}
