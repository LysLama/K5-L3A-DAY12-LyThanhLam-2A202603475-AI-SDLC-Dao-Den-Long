import * as THREE from 'three';
import { createRng } from '../sim/rng';
import type { NightId, Vec3 } from '../sim/types';
import { colorizeGeo, mergeParts } from './characterModels';

export interface AtmosphereUpdateInput {
  dt: number;
  elapsedSec: number;
  focusPos: Vec3;
  windActive: boolean;
  windWarning: boolean;
  windDirDeg: number;
  reduceMotion: boolean;
  benchMode: boolean;
}

export interface AtmosphereUpdateResult {
  lightningBoost: number;
}

interface CritterState {
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phase: number;
  flapSpeed: number;
  scale: number;
}

interface RainDropState {
  ox: number;
  y: number;
  oz: number;
  speed: number;
  lenScale: number;
}

interface LeafState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spinPhase: number;
}

const MAX_RAIN = 320;
const MAX_FIREFLIES = 48;
const MAX_CRITTERS = 28;
const MAX_LEAVES = 100;
const MAX_MIST = 28;

/**
 * Manages animated Vietnamese tropical fauna (high-canopy ambient fireflies & moths/dragonflies)
 * and dynamic weather (drizzle/monsoon rain, drifting lagoon/jungle mist, blown leaves, distant storm lightning).
 * Disabled cleanly when `benchMode = true` to preserve Contract v1.3 benchmark parity.
 */
export class AtmosphereManager {
  private readonly night: NightId;
  private readonly rainInst: THREE.InstancedMesh;
  private readonly fireflyInst: THREE.InstancedMesh;
  private readonly critterInst: THREE.InstancedMesh;
  private readonly leafInst: THREE.InstancedMesh;
  private readonly mistInst: THREE.InstancedMesh;

  private readonly rainDrops: RainDropState[] = [];
  private readonly fireflies: CritterState[] = [];
  private readonly critters: CritterState[] = [];
  private readonly leaves: LeafState[] = [];
  private readonly mists: CritterState[] = [];

  private readonly dummy = new THREE.Object3D();
  private lastSimSec = -1;
  private counts = { rain: 0, fireflies: 0, critters: 0, leaves: 0, mist: 0 };

  constructor(scene: THREE.Scene, night: NightId) {
    this.night = night;
    const rng = createRng(7400 + night * 313);

    // 1. Fine slender tropical rain streaks (kept translucent & subtle so near-camera drops don't block view)
    const rainGeo = new THREE.BoxGeometry(0.011, 0.46, 0.011);
    const rainMat = new THREE.MeshBasicMaterial({
      color: night === 3 ? '#c6def7' : '#a9cce8',
      transparent: true,
      opacity: night === 3 ? 0.36 : 0.24
    });
    this.rainInst = new THREE.InstancedMesh(rainGeo, rainMat, MAX_RAIN);
    this.rainInst.frustumCulled = false;
    this.rainInst.count = 0;
    scene.add(this.rainInst);

    for (let i = 0; i < MAX_RAIN; i++) {
      this.rainDrops.push({
        ox: (rng() - 0.5) * 56,
        y: rng() * 20,
        oz: (rng() - 0.5) * 56,
        speed: 17 + rng() * 8,
        lenScale: 0.8 + rng() * 0.55
      });
    }

    // 2. High-canopy ambient forest fireflies (soft cool-mint/lime high above gameplay pickups)
    const ffGeo = new THREE.OctahedronGeometry(0.065, 0);
    const ffMat = new THREE.MeshBasicMaterial({
      color: night === 2 ? '#a2f5ca' : '#b8f58e',
      transparent: true,
      opacity: 0.72
    });
    this.fireflyInst = new THREE.InstancedMesh(ffGeo, ffMat, MAX_FIREFLIES);
    this.fireflyInst.frustumCulled = false;
    this.fireflyInst.count = 0;
    scene.add(this.fireflyInst);

    const ffTarget = night === 1 ? 38 : night === 2 ? 44 : 34;
    for (let i = 0; i < ffTarget; i++) {
      const discX = night === 2 && i % 2 === 1 ? 70 : 0;
      const maxR = night === 2 ? 25 : night === 3 ? 42 : 37;
      const a = rng() * Math.PI * 2;
      const r = maxR * (0.45 + rng() * 0.52);
      this.fireflies.push({
        cx: discX + Math.cos(a) * r,
        cy: 2.3 + rng() * 3.4,
        cz: Math.sin(a) * r,
        rx: 1.2 + rng() * 2.2,
        rz: 1.2 + rng() * 2.2,
        speed: 0.45 + rng() * 0.65,
        phase: rng() * Math.PI * 2,
        flapSpeed: 1.8 + rng() * 2.4,
        scale: 0.75 + rng() * 0.6
      });
    }

    // 3. Flapping tropical moths / Night 2 aqua dragonflies
    const wingHex = night === 1 ? '#f5dca4' : night === 2 ? '#87ebee' : '#c9d6be';
    const wingAlt = night === 1 ? '#fff2cf' : night === 2 ? '#bff8e6' : '#aebf9e';
    const wingL = colorizeGeo(
      new THREE.ConeGeometry(0.11, 0.22, 3)
        .rotateX(Math.PI / 2)
        .rotateZ(Math.PI / 2)
        .translate(-0.11, 0.02, 0),
      wingHex
    );
    const wingR = colorizeGeo(
      new THREE.ConeGeometry(0.11, 0.22, 3)
        .rotateX(Math.PI / 2)
        .rotateZ(-Math.PI / 2)
        .translate(0.11, 0.02, 0),
      wingAlt
    );
    const bodySlim = colorizeGeo(new THREE.BoxGeometry(0.03, 0.03, 0.18), '#3b3347');
    const critterGeo = mergeParts([wingL, wingR, bodySlim]);
    const critterMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.critterInst = new THREE.InstancedMesh(critterGeo, critterMat, MAX_CRITTERS);
    this.critterInst.frustumCulled = false;
    this.critterInst.count = 0;
    scene.add(this.critterInst);

    const critterTarget = night === 2 ? 26 : night === 1 ? 22 : 18;
    for (let i = 0; i < critterTarget; i++) {
      let cx = 0;
      let cz = 0;
      let cy = 1.0 + rng() * 1.4;
      if (night === 2 && i < 12) {
        // Lagoon dragonflies skimming above lotus pads
        cx = 22 + rng() * 26;
        cz = (rng() - 0.5) * 26;
        cy = -9.6 + rng() * 1.2;
      } else {
        const discX = night === 2 && i % 2 === 1 ? 70 : 0;
        const maxR = night === 2 ? 24 : night === 3 ? 40 : 35;
        const a = rng() * Math.PI * 2;
        const r = maxR * (0.28 + rng() * 0.66);
        cx = discX + Math.cos(a) * r;
        cz = Math.sin(a) * r;
        if (night === 3) cy = 1.2 + rng() * 2.5;
      }
      this.critters.push({
        cx,
        cy,
        cz,
        rx: 1.6 + rng() * 2.8,
        rz: 1.6 + rng() * 2.8,
        speed: 0.7 + rng() * 0.9,
        phase: rng() * Math.PI * 2,
        flapSpeed: night === 2 ? 18 + rng() * 6 : 11 + rng() * 5,
        scale: 0.75 + rng() * 0.55
      });
    }

    // 4. Blown tropical leaves
    const leafGeo = colorizeGeo(
      new THREE.ConeGeometry(0.11, 0.24, 3).scale(1.1, 1.0, 0.2),
      night === 3 ? '#59824f' : '#659656'
    );
    const leafMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.leafInst = new THREE.InstancedMesh(leafGeo, leafMat, MAX_LEAVES);
    this.leafInst.frustumCulled = false;
    this.leafInst.count = 0;
    scene.add(this.leafInst);

    for (let i = 0; i < MAX_LEAVES; i++) {
      this.leaves.push({
        x: (rng() - 0.5) * 60,
        y: 0.8 + rng() * 7.5,
        z: (rng() - 0.5) * 60,
        vx: 1.2 + rng() * 2.4,
        vy: -0.7 - rng() * 0.8,
        vz: (rng() - 0.5) * 1.4,
        spinPhase: rng() * Math.PI * 2
      });
    }

    // 5. Low humid coastal / lagoon mist ribbons
    const mistGeo = new THREE.CylinderGeometry(3.8, 4.4, 0.36, 8);
    const mistMat = new THREE.MeshBasicMaterial({
      color: night === 2 ? '#2b476b' : '#203154',
      transparent: true,
      opacity: night === 2 ? 0.26 : 0.18,
      depthWrite: false
    });
    this.mistInst = new THREE.InstancedMesh(mistGeo, mistMat, MAX_MIST);
    this.mistInst.frustumCulled = false;
    this.mistInst.count = 0;
    scene.add(this.mistInst);

    const mistCount = night === 2 ? 26 : 20;
    for (let i = 0; i < mistCount; i++) {
      let cx = 0;
      let cz = 0;
      let cy = -0.35;
      if (night === 2 && i < 12) {
        cx = 22 + rng() * 26;
        cz = (rng() - 0.5) * 32;
        cy = -9.6 + rng() * 1.4;
      } else {
        const discX = night === 2 && i % 2 === 1 ? 70 : 0;
        const rBase = night === 2 ? 29 : night === 3 ? 46 : 41;
        const a = (i / mistCount) * Math.PI * 2;
        cx = discX + Math.cos(a) * (rBase + rng() * 8);
        cz = Math.sin(a) * (rBase + rng() * 8);
        cy = -3.8 + rng() * 2.8;
      }
      this.mists.push({
        cx,
        cy,
        cz,
        rx: 2.2 + rng() * 3.0,
        rz: 1.8 + rng() * 2.5,
        speed: 0.18 + rng() * 0.2,
        phase: rng() * Math.PI * 2,
        flapSpeed: 1,
        scale: 0.85 + rng() * 0.8
      });
    }
  }

  getActiveCounts(): { rain: number; fireflies: number; critters: number; leaves: number; mist: number } {
    return { ...this.counts };
  }

  update(input: AtmosphereUpdateInput): AtmosphereUpdateResult {
    const { dt, elapsedSec, focusPos, windActive, windWarning, windDirDeg, reduceMotion, benchMode } = input;

    if (benchMode) {
      this.rainInst.count = 0;
      this.fireflyInst.count = 0;
      this.critterInst.count = 0;
      this.leafInst.count = 0;
      this.mistInst.count = 0;
      this.counts = { rain: 0, fireflies: 0, critters: 0, leaves: 0, mist: 0 };
      return { lightningBoost: 0 };
    }

    // Gate high-frequency visual particle buffer updates (~60Hz cap) for crisp high-FPS headroom
    const shouldStep = this.lastSimSec < 0 || elapsedSec - this.lastSimSec >= 0.014 || dt >= 0.014;
    const stepDt = this.lastSimSec < 0 ? Math.min(0.05, Math.max(0.001, dt)) : Math.min(0.05, Math.max(0.001, elapsedSec - this.lastSimSec));
    if (shouldStep) {
      this.lastSimSec = elapsedSec;
      this.updateParticles(stepDt, elapsedSec, focusPos, windActive, windWarning, windDirDeg);
    }

    // Subtle distant monsoon lightning in Night 3 during active storms (strictly disabled if reduceMotion)
    let lightningBoost = 0;
    if (this.night === 3 && windActive && !reduceMotion) {
      const cycle = elapsedSec % 8.4;
      if ((cycle >= 3.1 && cycle <= 3.22) || (cycle >= 3.3 && cycle <= 3.38)) {
        lightningBoost = 0.55;
      }
    }

    return { lightningBoost };
  }

  private updateParticles(
    stepDt: number,
    elapsedSec: number,
    focusPos: Vec3,
    windActive: boolean,
    windWarning: boolean,
    windDirDeg: number
  ): void {
    const rad = (windDirDeg * Math.PI) / 180;
    const windX = Math.cos(rad);
    const windZ = Math.sin(rad);

    // 1. Rain streaks around camera/player focus box
    const rainCount =
      this.night === 1 ? 150 : this.night === 2 ? 200 : windActive ? MAX_RAIN : windWarning ? 260 : 210;
    const rainHorizSpeed = this.night === 3 ? (windActive ? 14.5 : 6.0) : this.night === 2 ? 2.4 : 1.5;
    const tiltRad = Math.atan2(rainHorizSpeed, 20);
    const tiltAxisYaw = -rad + Math.PI / 2;

    for (let i = 0; i < rainCount; i++) {
      const drop = this.rainDrops[i];
      drop.y -= drop.speed * stepDt;
      drop.ox += windX * rainHorizSpeed * stepDt;
      drop.oz += windZ * rainHorizSpeed * stepDt;

      if (drop.y < -1) drop.y += 21;
      if (drop.ox > 28) drop.ox -= 56;
      else if (drop.ox < -28) drop.ox += 56;
      if (drop.oz > 28) drop.oz -= 56;
      else if (drop.oz < -28) drop.oz += 56;

      const wx = focusPos[0] + drop.ox;
      const wz = focusPos[2] + drop.oz;
      // Push drops slightly away from very tight center focus to prevent thick streaks near lens
      const distSq = drop.ox * drop.ox + drop.oz * drop.oz;
      const yLift = distSq < 9 ? 4.5 : 0;
      this.dummy.position.set(wx, focusPos[1] + drop.y + yLift, wz);
      this.dummy.rotation.set(tiltRad, tiltAxisYaw, 0);
      this.dummy.scale.set(1, drop.lenScale, 1);
      this.dummy.updateMatrix();
      this.rainInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.rainInst.count = rainCount;
    this.rainInst.instanceMatrix.needsUpdate = true;

    // 2. Ambient high-canopy forest fireflies
    for (let i = 0; i < this.fireflies.length; i++) {
      const f = this.fireflies[i];
      const t = elapsedSec * f.speed + f.phase;
      const pulse = 0.55 + 0.45 * Math.sin(elapsedSec * f.flapSpeed + f.phase);
      this.dummy.position.set(
        f.cx + Math.sin(t) * f.rx,
        f.cy + Math.sin(t * 1.7) * 0.42,
        f.cz + Math.cos(t * 0.85) * f.rz
      );
      this.dummy.rotation.set(0, t, 0);
      this.dummy.scale.setScalar(f.scale * pulse);
      this.dummy.updateMatrix();
      this.fireflyInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.fireflyInst.count = this.fireflies.length;
    this.fireflyInst.instanceMatrix.needsUpdate = true;

    // 3. Flapping forest moths & lagoon dragonflies
    for (let i = 0; i < this.critters.length; i++) {
      const c = this.critters[i];
      const t = elapsedSec * c.speed + c.phase;
      const x = c.cx + Math.cos(t) * c.rx;
      const z = c.cz + Math.sin(t * 1.3) * c.rz;
      const dx = -Math.sin(t) * c.rx;
      const dz = 1.3 * Math.cos(t * 1.3) * c.rz;
      const flap = 0.25 + 0.75 * Math.abs(Math.sin(elapsedSec * c.flapSpeed + c.phase));

      this.dummy.position.set(x, c.cy + Math.sin(t * 2.2) * 0.24, z);
      this.dummy.rotation.set(0.18, Math.atan2(dx, dz), 0);
      this.dummy.scale.set(c.scale * flap, c.scale, c.scale);
      this.dummy.updateMatrix();
      this.critterInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.critterInst.count = this.critters.length;
    this.critterInst.instanceMatrix.needsUpdate = true;

    // 4. Blown jungle leaves (dramatically boosted during Night 3 windstorms)
    const leafCount = this.night === 3 ? (windActive ? MAX_LEAVES : windWarning ? 65 : 35) : 22;
    const leafWindMul = this.night === 3 && windActive ? 5.2 : 1.0;
    for (let i = 0; i < leafCount; i++) {
      const l = this.leaves[i];
      l.x += (windX * l.vx * leafWindMul + Math.sin(elapsedSec * 2 + l.spinPhase) * 0.6) * stepDt;
      l.z += (windZ * l.vx * leafWindMul + Math.cos(elapsedSec * 1.8 + l.spinPhase) * 0.6) * stepDt;
      l.y += l.vy * stepDt;

      if (l.y < 0.05) {
        l.y = 6.5 + (i % 4) * 0.8;
        l.x = focusPos[0] + ((i * 19) % 50) - 25;
        l.z = focusPos[2] + ((i * 29) % 50) - 25;
      }
      this.dummy.position.set(l.x, l.y, l.z);
      this.dummy.rotation.set(
        elapsedSec * 4 + l.spinPhase,
        elapsedSec * 2.8 + l.spinPhase,
        Math.sin(elapsedSec * 5 + l.spinPhase) * 0.8
      );
      this.dummy.scale.setScalar(1.0);
      this.dummy.updateMatrix();
      this.leafInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.leafInst.count = leafCount;
    this.leafInst.instanceMatrix.needsUpdate = true;

    // 5. Drifting humid mist bands
    for (let i = 0; i < this.mists.length; i++) {
      const m = this.mists[i];
      const t = elapsedSec * m.speed + m.phase;
      this.dummy.position.set(m.cx + Math.sin(t) * m.rx, m.cy, m.cz + Math.cos(t * 0.8) * m.rz);
      this.dummy.rotation.set(0, t * 0.25, 0);
      this.dummy.scale.set(m.scale, 1, m.scale * 1.25);
      this.dummy.updateMatrix();
      this.mistInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.mistInst.count = this.mists.length;
    this.mistInst.instanceMatrix.needsUpdate = true;

    this.counts = {
      rain: rainCount,
      fireflies: this.fireflies.length,
      critters: this.critters.length,
      leaves: leafCount,
      mist: this.mists.length
    };
  }
}
