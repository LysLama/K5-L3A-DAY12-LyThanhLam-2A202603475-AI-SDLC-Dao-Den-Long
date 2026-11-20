import * as THREE from 'three';
import { ISLAND_RADIUS, TUNING } from '../sim/constants';
import type { SimEvent, SimState } from '../sim/types';

interface LanternVisual {
  group: THREE.Group;
  coreMat: THREE.MeshStandardMaterial;
  flameMesh: THREE.Mesh;
  light: THREE.PointLight;
  safeRingMat: THREE.MeshBasicMaterial;
  crystalMeshes: THREE.Mesh[];
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshBasicMaterial;
  stunHalo: THREE.Mesh;
}

interface PulseWave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
}

export class IslandScene {
  readonly scene = new THREE.Scene();
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;

  private readonly mayGroup = new THREE.Group();
  private readonly mayLanternPivot = new THREE.Group();
  private readonly mayLanternLight: THREE.PointLight;
  private readonly mayBodyMat: THREE.MeshStandardMaterial;

  private readonly cloudClusters: THREE.Group[] = [];
  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteVisuals = new Map<string, THREE.Group>();
  private readonly shadeVisuals = new Map<string, ShadeVisual>();
  private readonly pulseWaves: PulseWave[] = [];

  private readonly darkBg = new THREE.Color('#130d24');
  private readonly warmBg = new THREE.Color('#2c1f3d');
  private readonly darkFog = new THREE.Color('#140d26');
  private readonly warmFog = new THREE.Color('#342347');

  constructor(initialState: SimState) {
    this.scene.background = this.darkBg.clone();
    this.fog = new THREE.FogExp2(this.darkFog.getHex(), 0.0145);
    this.scene.fog = this.fog;

    this.hemiLight = new THREE.HemisphereLight('#9486d4', '#292047', 0.92);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight('#cbbdff', 0.8);
    this.dirLight.position.set(18, 32, -16);
    this.scene.add(this.dirLight);

    this.buildIslandBase();
    this.buildStarsAndClouds();

    const { bodyMat, lanternLight } = this.buildMayCharacter();
    this.mayBodyMat = bodyMat;
    this.mayLanternLight = lanternLight;
    this.scene.add(this.mayGroup);

    for (const l of initialState.lanterns) {
      this.createLanternVisual(l.id, l.pos);
    }
    this.sync(initialState, [], 0);
  }

  private buildIslandBase(): void {
    // Circular island deck top at Y = 0
    const topGeo = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.94, 3.2, 64);
    const topMat = new THREE.MeshStandardMaterial({
      color: '#303152',
      roughness: 0.9,
      metalness: 0.05
    });
    const islandMesh = new THREE.Mesh(topGeo, topMat);
    islandMesh.position.y = -1.6;
    this.scene.add(islandMesh);

    // Inner stone plaza around spawn (0,0,0)
    const plazaGeo = new THREE.CylinderGeometry(4.5, 4.7, 0.08, 32);
    const plazaMat = new THREE.MeshStandardMaterial({ color: '#3a3554', roughness: 0.85 });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.y = 0.02;
    this.scene.add(plaza);

    // Glowing cliff rim ring so island edge is clearly readable
    const rimGeo = new THREE.RingGeometry(ISLAND_RADIUS - 0.55, ISLAND_RADIUS, 72);
    const rimMat = new THREE.MeshBasicMaterial({
      color: '#ffb65c',
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.04;
    this.scene.add(rim);

    // Decorative edge boundary stones
    const stoneGeo = new THREE.DodecahedronGeometry(0.65, 0);
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#3b3759', roughness: 0.88 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.position.set(
        Math.cos(a) * (ISLAND_RADIUS - 0.6),
        0.15,
        Math.sin(a) * (ISLAND_RADIUS - 0.6)
      );
      stone.scale.set(1.2, 0.65, 1.0);
      this.scene.add(stone);
    }
  }

  private buildStarsAndClouds(): void {
    const starCount = 320;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 70 + ((i * 37) % 45);
      const theta = i * 2.39996;
      const phi = 0.18 + ((i * 19) % 100) * 0.011;
      positions[i * 3] = r * Math.cos(theta) * Math.cos(phi);
      positions[i * 3 + 1] = Math.abs(r * Math.sin(phi)) + 10;
      positions[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: '#ffe6b3', size: 0.65, transparent: true, opacity: 0.85 });
    this.scene.add(new THREE.Points(starGeo, starMat));

    // Sea of clouds below the island
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#2b2447',
      emissive: '#140f29',
      roughness: 1
    });
    const puffGeo = new THREE.SphereGeometry(4.2, 12, 10);
    for (let i = 0; i < 18; i++) {
      const cluster = new THREE.Group();
      const angle = (i / 18) * Math.PI * 2;
      const dist = 26 + (i % 3) * 14;
      cluster.position.set(Math.cos(angle) * dist, -6.5 - (i % 2) * 1.4, Math.sin(angle) * dist);
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set((j - 1) * 3.8, (j % 2) * 0.6, ((j + i) % 2) * 1.8);
        puff.scale.set(1.4, 0.45, 1.2);
        cluster.add(puff);
      }
      this.cloudClusters.push(cluster);
      this.scene.add(cluster);
    }
  }

  private buildMayCharacter(): { bodyMat: THREE.MeshStandardMaterial; lanternLight: THREE.PointLight } {
    // Cloak & body (feet at Y=0)
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#f3e5c8', roughness: 0.7 });
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.05, 14), bodyMat);
    cloak.position.y = 0.55;
    this.mayGroup.add(cloak);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 14),
      new THREE.MeshStandardMaterial({ color: '#ffe1c4', roughness: 0.65 })
    );
    head.position.y = 1.22;
    this.mayGroup.add(head);

    // Conical Vietnamese leaf hat (Nón lá)
    const hatMat = new THREE.MeshStandardMaterial({ color: '#e6be73', roughness: 0.75 });
    const nonLa = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.36, 20), hatMat);
    nonLa.position.y = 1.48;
    this.mayGroup.add(nonLa);

    // Small warm lantern hanging from the hat brim (visible from rear 3rd-person camera)
    this.mayLanternPivot.position.set(-0.56, 1.32, 0.22);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.24, 6),
      new THREE.MeshBasicMaterial({ color: '#b58952' })
    );
    cord.position.y = -0.12;
    this.mayLanternPivot.add(cord);

    const miniLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#ffbe52' })
    );
    miniLantern.position.y = -0.26;
    this.mayLanternPivot.add(miniLantern);

    const lanternLight = new THREE.PointLight('#ff9e3d', 2.8, 12, 1.5);
    lanternLight.position.y = -0.26;
    this.mayLanternPivot.add(lanternLight);

    this.mayGroup.add(this.mayLanternPivot);
    return { bodyMat, lanternLight };
  }

  private createLanternVisual(id: string, pos: [number, number, number]): void {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const stoneMat = new THREE.MeshStandardMaterial({ color: '#4d4869', roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.55, 8), stoneMat);
    base.position.y = 0.275;
    group.add(base);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.2, 8), stoneMat);
    pillar.position.y = 1.65;
    group.add(pillar);

    const coreMat = new THREE.MeshStandardMaterial({
      color: '#73659c',
      emissive: '#3b2b66',
      emissiveIntensity: 0.75,
      roughness: 0.35
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), coreMat);
    core.position.y = 3.05;
    group.add(core);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.55, 6), stoneMat);
    roof.position.y = 3.72;
    group.add(roof);

    const flameMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#ffbb4d' })
    );
    flameMesh.position.y = 3.05;
    flameMesh.visible = false;
    group.add(flameMesh);

    const light = new THREE.PointLight('#ff9c38', 0, 18, 1.5);
    light.position.y = 3.1;
    group.add(light);

    const safeRingGeo = new THREE.RingGeometry(TUNING.safe_radius - 0.14, TUNING.safe_radius, 48);
    const safeRingMat = new THREE.MeshBasicMaterial({
      color: '#ffb74d',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    const safeRing = new THREE.Mesh(safeRingGeo, safeRingMat);
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.05;
    group.add(safeRing);

    // Creative visual detail: spirit crystals around the pedestal that awaken when lit
    const crystalMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const c = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.45, 5),
        new THREE.MeshStandardMaterial({
          color: '#3f3863',
          emissive: '#ffaa44',
          emissiveIntensity: 0
        })
      );
      c.position.set(Math.cos(a) * 1.4, 0.22, Math.sin(a) * 1.4);
      group.add(c);
      crystalMeshes.push(c);
    }

    this.lanternVisuals.set(id, { group, coreMat, flameMesh, light, safeRingMat, crystalMeshes });
    this.scene.add(group);
  }

  private createMoteVisual(id: string): THREE.Group {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ffd966' })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ff9f2e', transparent: true, opacity: 0.35 })
    );
    group.add(core);
    group.add(halo);
    this.moteVisuals.set(id, group);
    this.scene.add(group);
    return group;
  }

  private createShadeVisual(id: string): ShadeVisual {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#12081c',
      emissive: '#2c1045',
      emissiveIntensity: 0.85,
      roughness: 0.65
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 12), bodyMat);
    body.scale.set(1, 1.35, 1);
    group.add(body);

    const cloakTail = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.9, 10), bodyMat);
    cloakTail.position.y = -0.35;
    cloakTail.rotation.x = Math.PI;
    group.add(cloakTail);

    const eyeMat = new THREE.MeshBasicMaterial({ color: '#c45cff' });
    const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.18, 0.16, 0.5);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.18, 0.16, 0.5);
    group.add(eyeL);
    group.add(eyeR);

    const stunHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#ffd452' })
    );
    stunHalo.rotation.x = Math.PI / 2;
    stunHalo.position.y = 0.85;
    stunHalo.visible = false;
    group.add(stunHalo);

    const visual: ShadeVisual = { group, bodyMat, eyeMat, stunHalo };
    this.shadeVisuals.set(id, visual);
    this.scene.add(group);
    return visual;
  }

  private spawnPulseWave(pos: [number, number, number]): void {
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffcf5c',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 48), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos[0], 0.12, pos[2]);
    this.scene.add(mesh);
    this.pulseWaves.push({ mesh, mat, age: 0 });
  }

  sync(state: SimState, events: ReadonlyArray<SimEvent>, elapsedSec: number): void {
    // 1. Update Mây
    const p = state.player;
    this.mayGroup.position.set(p.pos[0], p.pos[1], p.pos[2]);
    this.mayGroup.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
    this.mayLanternPivot.rotation.z = Math.sin(elapsedSec * 5.2) * 0.12;
    this.mayLanternLight.intensity = 2.2 + Math.sin(elapsedSec * 7.5) * 0.25;
    this.mayBodyMat.emissive.setHex(
      p.invulnRemaining > 0 && Math.floor(elapsedSec * 14) % 2 === 0 ? 0xff6b6b : 0x000000
    );

    // 2. Update 5 Great Lanterns & progressive island illumination
    let litCount = 0;
    for (const l of state.lanterns) {
      if (l.lit) litCount += 1;
      const vis = this.lanternVisuals.get(l.id);
      if (!vis) continue;
      vis.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      const ratio = Math.min(1, l.deposited / TUNING.lantern_cost);
      if (l.lit) {
        vis.coreMat.color.set('#ffcf6b');
        vis.coreMat.emissive.set('#ff9924');
        vis.coreMat.emissiveIntensity = 1.4;
        vis.flameMesh.visible = true;
        vis.flameMesh.scale.setScalar(0.95 + Math.sin(elapsedSec * 8) * 0.08);
        vis.light.intensity = 6.0 + Math.sin(elapsedSec * 6) * 0.4;
        vis.safeRingMat.opacity = 0.42 + Math.sin(elapsedSec * 3) * 0.08;
        vis.crystalMeshes.forEach((c) => {
          (c.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
        });
      } else {
        vis.coreMat.color.set('#73659c');
        vis.coreMat.emissive.set(ratio > 0 ? '#ff9d3b' : '#4d3b82');
        vis.coreMat.emissiveIntensity = 0.45 + ratio * 0.85;
        vis.flameMesh.visible = false;
        vis.light.intensity = ratio * 1.8;
        vis.safeRingMat.opacity = 0;
        vis.crystalMeshes.forEach((c) => {
          (c.material as THREE.MeshStandardMaterial).emissiveIntensity = ratio * 0.25;
        });
      }
    }

    const warmFactor = litCount / TUNING.lantern_count_night1;
    (this.scene.background as THREE.Color).lerpColors(this.darkBg, this.warmBg, warmFactor);
    this.fog.color.lerpColors(this.darkFog, this.warmFog, warmFactor);
    this.fog.density = 0.0155 - warmFactor * 0.0055;
    this.hemiLight.intensity = 0.88 + warmFactor * 0.55;
    this.dirLight.intensity = 0.75 + warmFactor * 0.5;

    // 3. Sync Motes
    const activeMoteIds = new Set<string>();
    for (const m of state.motes) {
      activeMoteIds.add(m.id);
      const vis = this.moteVisuals.get(m.id) ?? this.createMoteVisual(m.id);
      const bob = 0.68 + Math.sin(elapsedSec * 3.4 + m.pos[0]) * 0.16;
      vis.position.set(m.pos[0], bob, m.pos[2]);
    }
    for (const [id, vis] of this.moteVisuals.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(vis);
        this.moteVisuals.delete(id);
      }
    }

    // 4. Sync Shades
    const activeShadeIds = new Set<string>();
    for (const s of state.shades) {
      activeShadeIds.add(s.id);
      const vis = this.shadeVisuals.get(s.id) ?? this.createShadeVisual(s.id);
      const hover = s.state === 'stunned' ? 0 : Math.sin(elapsedSec * 4.5 + s.pos[0]) * 0.12;
      vis.group.position.set(s.pos[0], s.pos[1] + hover, s.pos[2]);
      const lookDx = p.pos[0] - s.pos[0];
      const lookDz = p.pos[2] - s.pos[2];
      vis.group.rotation.y = Math.atan2(lookDx, lookDz);

      if (s.state === 'stunned') {
        vis.bodyMat.emissive.set('#665018');
        vis.eyeMat.color.set('#ffd452');
        vis.stunHalo.visible = true;
        vis.stunHalo.rotation.z = elapsedSec * 5;
      } else {
        vis.bodyMat.emissive.set('#2c1045');
        vis.eyeMat.color.set('#c45cff');
        vis.stunHalo.visible = false;
      }
    }
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }

    // 5. Events & Pulse wave animation
    for (const ev of events) {
      if (ev.name === 'pulse') {
        this.spawnPulseWave(p.pos);
      }
    }
    for (let i = this.pulseWaves.length - 1; i >= 0; i--) {
      const w = this.pulseWaves[i];
      w.age += 1 / 60;
      const progress = Math.min(1, w.age / 0.45);
      const scale = 1 + progress * (TUNING.pulse_radius - 0.8);
      w.mesh.scale.set(scale, scale, 1);
      w.mat.opacity = (1 - progress) * 0.85;
      if (progress >= 1) {
        this.scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        w.mat.dispose();
        this.pulseWaves.splice(i, 1);
      }
    }

    // 6. Drift cloud sea gently
    this.cloudClusters.forEach((c, idx) => {
      c.position.y = -6.5 - (idx % 2) * 1.4 + Math.sin(elapsedSec * 0.4 + idx) * 0.35;
    });
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    });
  }
}
