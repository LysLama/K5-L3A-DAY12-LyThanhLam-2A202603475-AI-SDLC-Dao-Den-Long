import * as THREE from 'three';
import { TUNING } from '../sim/constants';
import type { Vec3 } from '../sim/types';

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  age: number;
  life: number;
  gravity: number;
  baseScale: number;
}

interface ShockWave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  maxScale: number;
}

export class VfxManager {
  private readonly particles: Particle[] = [];
  private readonly waves: ShockWave[] = [];
  private readonly sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
  private readonly ringGeo = new THREE.RingGeometry(0.65, 1.0, 48);

  constructor(private readonly scene: THREE.Scene) {}

  spawnBurst(pos: Vec3, colorHex: number, count: number, speed = 3.5, upward = 2.8, scale = 1.0): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.set(pos[0], pos[1] + 0.5, pos[2]);
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.27;
      const spd = speed * (0.55 + ((i * 37) % 10) * 0.06);
      const vel = new THREE.Vector3(
        Math.cos(angle) * spd,
        upward * (0.6 + ((i * 19) % 10) * 0.07),
        Math.sin(angle) * spd
      );
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        mat,
        vel,
        age: 0,
        life: 0.5 + (i % 4) * 0.12,
        gravity: -4.2,
        baseScale: scale
      });
    }
  }

  spawnDepositStream(from: Vec3, to: Vec3): void {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffcf5c,
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      const t = i / count;
      mesh.position.set(
        from[0] + (to[0] - from[0]) * t * 0.3,
        from[1] + 0.9 + t * 0.5,
        from[2] + (to[2] - from[2]) * t * 0.3
      );
      const vel = new THREE.Vector3(
        (to[0] - from[0]) * 1.6,
        2.2 + i * 0.18,
        (to[2] - from[2]) * 1.6
      );
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        mat,
        vel,
        age: -i * 0.025,
        life: 0.55,
        gravity: 0.5,
        baseScale: 1.15
      });
    }
  }

  spawnLanternCelebration(pos: Vec3): void {
    this.spawnBurst([pos[0], pos[1] + 2.5, pos[2]], 0xffd15c, 22, 4.8, 5.2, 1.45);
    this.spawnWave(pos, 0xffc857, TUNING.safe_radius, 0.7);
  }

  spawnPulseEffect(pos: Vec3): void {
    this.spawnWave(pos, 0xffd86b, TUNING.pulse_radius, 0.45);
    this.spawnWave(pos, 0xff9a3c, TUNING.pulse_radius * 0.72, 0.35);
    this.spawnBurst(pos, 0xffe07a, 18, 8.2, 1.8, 1.25);
  }

  spawnWave(pos: Vec3, colorHex: number, maxScale: number, life: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos[0], pos[1] + 0.14, pos[2]);
    this.scene.add(mesh);
    this.waves.push({ mesh, mat, age: 0, life, maxScale });
  }

  spawnDust(pos: Vec3): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc9b48a,
      transparent: true,
      opacity: 0.45
    });
    const mesh = new THREE.Mesh(this.sparkGeo, mat);
    mesh.position.set(pos[0], pos[1] + 0.12, pos[2]);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      mat,
      vel: new THREE.Vector3(0, 0.6, 0),
      age: 0,
      life: 0.32,
      gravity: 0,
      baseScale: 0.7
    });
  }

  spawnDashTrail(pos: Vec3, facing: readonly [number, number]): void {
    this.spawnWave([pos[0], pos[1] + 0.25, pos[2]], 0xfff6c2, 1.8, 0.28);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xf2c14e : 0xfff6c2,
        transparent: true,
        opacity: 0.9
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      const jitter = (i - 2.5) * 0.22;
      mesh.position.set(pos[0] - facing[0] * 0.3 + jitter * facing[1], pos[1] + 0.55 + (i % 2) * 0.25, pos[2] - facing[1] * 0.3 - jitter * facing[0]);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        mat,
        vel: new THREE.Vector3(-facing[0] * 3.2, 0.8 + (i % 3) * 0.35, -facing[1] * 3.2),
        age: 0,
        life: 0.26,
        gravity: -1.5,
        baseScale: 0.95
      });
    }
  }

  spawnWindStreak(pos: Vec3, dirDeg: number, warningOnly: boolean): void {
    const rad = (dirDeg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uz = Math.sin(rad);
    const mat = new THREE.MeshBasicMaterial({
      color: warningOnly ? 0xf2c14e : 0x8fa3b8,
      transparent: true,
      opacity: warningOnly ? 0.55 : 0.75
    });
    const mesh = new THREE.Mesh(this.sparkGeo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.scale.set(2.2, 0.45, 0.45);
    this.scene.add(mesh);
    const spd = warningOnly ? 7.5 : 15.0;
    this.particles.push({
      mesh,
      mat,
      vel: new THREE.Vector3(ux * spd, 0.3, uz * spd),
      age: 0,
      life: 0.55,
      gravity: 0,
      baseScale: 0.9
    });
  }

  update(dt: number): void {
    if (dt <= 0) return;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age < 0) continue;
      if (p.age >= p.life) {
        this.scene.remove(p.mesh);
        p.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.y += 4 * dt;
      const t = p.age / p.life;
      p.mat.opacity = 1 - t;
      p.mesh.scale.setScalar(p.baseScale * (1 - t * 0.65));
    }

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.age += dt;
      if (w.age >= w.life) {
        this.scene.remove(w.mesh);
        w.mat.dispose();
        this.waves.splice(i, 1);
        continue;
      }
      const progress = w.age / w.life;
      const eased = 1 - Math.pow(1 - progress, 3);
      w.mesh.scale.setScalar(0.8 + eased * w.maxScale);
      w.mat.opacity = (1 - progress) * 0.85;
    }
  }

  dispose(): void {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mat.dispose();
    }
    for (const w of this.waves) {
      this.scene.remove(w.mesh);
      w.mat.dispose();
    }
    this.particles.length = 0;
    this.waves.length = 0;
    this.sparkGeo.dispose();
    this.ringGeo.dispose();
  }
}
