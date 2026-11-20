import * as THREE from 'three';
import { ISLAND_RADIUS, TUNING } from '../sim/constants';
import type { SimEvent, SimState, Vec3 } from '../sim/types';
import { VfxManager } from './particles';
import { interpolatePos, unwrapAngleRad } from './renderMath';
import { createGlowTexture, createIslandGroundTexture } from './textures';

interface LanternVisual {
  group: THREE.Group;
  coreMat: THREE.MeshStandardMaterial;
  flameMesh: THREE.Mesh;
  flameHalo: THREE.Sprite;
  light: THREE.PointLight;
  safeRingMat: THREE.MeshBasicMaterial;
  innerRingMesh: THREE.Mesh;
  innerRingMat: THREE.MeshBasicMaterial;
  crystalMeshes: THREE.Mesh[];
  orbitMotes: THREE.Mesh[];
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshBasicMaterial;
  wisps: THREE.Mesh[];
  stunStarsGroup: THREE.Group;
}

export interface RenderSyncOptions {
  alpha: number;
  simDt: number;
  frameDt: number;
  elapsedSec: number;
  isMovingInput: boolean;
  prevPlayerPos: Vec3;
  prevShadePositions: ReadonlyMap<string, Vec3>;
}

export class IslandScene {
  readonly scene = new THREE.Scene();
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;
  private readonly vfx: VfxManager;

  private readonly groundTex: THREE.CanvasTexture;
  private readonly warmGlowTex: THREE.CanvasTexture;

  private readonly moteCoreGeo = new THREE.SphereGeometry(0.16, 12, 10);
  private readonly moteCoreMat = new THREE.MeshBasicMaterial({ color: '#ffe57f' });

  private readonly mayGroup = new THREE.Group();
  private readonly mayVisualPivot = new THREE.Group();
  private readonly mayLeftFoot = new THREE.Mesh();
  private readonly mayRightFoot = new THREE.Mesh();
  private readonly mayLeftArm = new THREE.Mesh();
  private readonly mayRightArm = new THREE.Mesh();
  private readonly mayLanternPivot = new THREE.Group();
  private readonly mayLanternLight: THREE.PointLight;
  private readonly mayBodyMat: THREE.MeshStandardMaterial;

  private readonly cloudClusters: THREE.Group[] = [];
  private readonly treeCrowns: THREE.Group[] = [];
  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteVisuals = new Map<string, THREE.Group>();
  private readonly shadeVisuals = new Map<string, ShadeVisual>();

  private moveBlend = 0;
  private walkPhase = 0;
  private dustCooldown = 0;

  private readonly darkBg = new THREE.Color('#0f0a21');
  private readonly warmBg = new THREE.Color('#2d1e42');
  private readonly darkFog = new THREE.Color('#130d29');
  private readonly warmFog = new THREE.Color('#3a254d');

  constructor(initialState: SimState) {
    this.groundTex = createIslandGroundTexture();
    this.warmGlowTex = createGlowTexture('rgba(255,248,210,1)', 'rgba(255,175,60,0.55)');
    this.vfx = new VfxManager(this.scene);

    this.scene.background = this.darkBg.clone();
    this.fog = new THREE.FogExp2(this.darkFog.getHex(), 0.0115);
    this.scene.fog = this.fog;

    this.hemiLight = new THREE.HemisphereLight('#a294e8', '#2a1f4a', 0.96);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight('#d8ccff', 0.85);
    this.dirLight.position.set(22, 36, -18);
    this.scene.add(this.dirLight);

    this.buildIslandEnvironment();
    this.buildSkyAndClouds();

    const mayParts = this.buildMayCharacter();
    this.mayBodyMat = mayParts.bodyMat;
    this.mayLanternLight = mayParts.lanternLight;
    this.mayLeftFoot.geometry = mayParts.footGeo;
    this.mayLeftFoot.material = mayParts.footMat;
    this.mayRightFoot.geometry = mayParts.footGeo;
    this.mayRightFoot.material = mayParts.footMat;
    this.mayLeftArm.geometry = mayParts.armGeo;
    this.mayLeftArm.material = mayParts.armMat;
    this.mayRightArm.geometry = mayParts.armGeo;
    this.mayRightArm.material = mayParts.armMat;
    this.scene.add(this.mayGroup);

    for (const l of initialState.lanterns) {
      this.createLanternVisual(l.id, l.pos);
    }
    this.sync(initialState, [], {
      alpha: 1,
      simDt: 0,
      frameDt: 0,
      elapsedSec: 0,
      isMovingInput: false,
      prevPlayerPos: initialState.player.pos,
      prevShadePositions: new Map()
    });
  }

  private buildIslandEnvironment(): void {
    // Upper island stone base + UV-aligned top deck (top surface at Y = 0)
    const topGeo = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.96, 2.2, 72);
    const topMat = new THREE.MeshStandardMaterial({
      color: '#20223b',
      roughness: 0.94,
      metalness: 0.04
    });
    const islandMesh = new THREE.Mesh(topGeo, topMat);
    islandMesh.position.y = -1.1;
    this.scene.add(islandMesh);

    const surfaceGeo = new THREE.CircleGeometry(ISLAND_RADIUS - 0.1, 72);
    const surfaceMat = new THREE.MeshStandardMaterial({
      map: this.groundTex,
      roughness: 0.92,
      metalness: 0.04
    });
    const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfaceMesh.rotation.x = -Math.PI / 2;
    surfaceMesh.position.y = 0.006;
    this.scene.add(surfaceMesh);

    // Tapered rocky cliff underside floating above cloud sea
    const skirtGeo = new THREE.ConeGeometry(ISLAND_RADIUS * 0.95, 11.5, 24, 1, true);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: '#1e1a36',
      roughness: 0.96,
      flatShading: true
    });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.rotation.x = Math.PI;
    skirt.position.y = -7.9;
    this.scene.add(skirt);

    // Central Sanctuary Stone Medallion around (0, 0, 0)
    const plazaGeo = new THREE.CylinderGeometry(4.3, 4.6, 0.08, 32);
    const plazaMat = new THREE.MeshStandardMaterial({ color: '#45406b', roughness: 0.8 });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.y = 0.02;
    this.scene.add(plaza);

    // Glowing cliff rim border
    const rimGeo = new THREE.RingGeometry(ISLAND_RADIUS - 0.55, ISLAND_RADIUS, 72);
    const rimMat = new THREE.MeshBasicMaterial({
      color: '#ffbe66',
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.03;
    this.scene.add(rim);

    // Harbor Wooden Pier ("Đảo Bến") extending slightly at +Z edge past L1
    const pierGroup = new THREE.Group();
    pierGroup.position.set(0, 0.05, ISLAND_RADIUS - 0.8);
    const woodMat = new THREE.MeshStandardMaterial({ color: '#6b4a35', roughness: 0.88 });
    for (let i = 0; i < 6; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.55), woodMat);
      plank.position.set(0, 0, i * 0.72);
      pierGroup.add(plank);
    }
    for (const sx of [-1.45, 1.45]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 1.5, 8), woodMat);
      post.position.set(sx, 0.45, 3.6);
      pierGroup.add(post);
      const miniOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshBasicMaterial({ color: '#ffbd59' })
      );
      miniOrb.position.set(sx, 1.25, 3.6);
      pierGroup.add(miniOrb);
    }
    this.scene.add(pierGroup);

    // Perimeter stones
    const stoneGeo = new THREE.DodecahedronGeometry(0.75, 0);
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#39355c',
      roughness: 0.9,
      flatShading: true
    });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + 0.12;
      if (Math.abs(a - Math.PI / 2) < 0.18) continue;
      const stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.position.set(
        Math.cos(a) * (ISLAND_RADIUS - 0.8),
        0.16,
        Math.sin(a) * (ISLAND_RADIUS - 0.8)
      );
      stone.rotation.y = a * 2;
      stone.scale.set(1.25, 0.65 + (i % 3) * 0.18, 1.0);
      this.scene.add(stone);
    }

    // Stylized fairytale spirit pine trees nestled between lantern sectors
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#463547', roughness: 0.92 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: '#253c59',
      emissive: '#101d30',
      roughness: 0.85,
      flatShading: true
    });
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + 0.31;
      const dist = 28.5 + (i % 2) * 3.2;
      const tree = new THREE.Group();
      tree.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 1.8, 7), trunkMat);
      trunk.position.y = 0.9;
      tree.add(trunk);

      const crown = new THREE.Group();
      crown.position.y = 1.9;
      const tier1 = new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.0, 7), leafMat);
      tier1.position.y = 0.6;
      const tier2 = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.7, 7), leafMat);
      tier2.position.y = 1.65;
      const tier3 = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.3, 7), leafMat);
      tier3.position.y = 2.5;
      crown.add(tier1, tier2, tier3);
      tree.add(crown);
      this.treeCrowns.push(crown);
      this.scene.add(tree);
    }
  }

  private buildSkyAndClouds(): void {
    const moonGroup = new THREE.Group();
    moonGroup.position.set(-48, 42, 62);
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 24, 20),
      new THREE.MeshBasicMaterial({ color: '#fff2cf' })
    );
    const moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: '#ffe4a8',
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    moonGlow.scale.set(24, 24, 1);
    moonGroup.add(moonMesh, moonGlow);
    this.scene.add(moonGroup);

    const starCount = 420;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 74 + ((i * 41) % 52);
      const theta = i * 2.39996;
      const phi = 0.16 + ((i * 19) % 100) * 0.011;
      positions[i * 3] = r * Math.cos(theta) * Math.cos(phi);
      positions[i * 3 + 1] = Math.abs(r * Math.sin(phi)) + 8;
      positions[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: '#ffebc2',
      size: 0.72,
      transparent: true,
      opacity: 0.9
    });
    this.scene.add(new THREE.Points(starGeo, starMat));

    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#2e264f',
      emissive: '#181233',
      roughness: 0.98,
      flatShading: true
    });
    const puffGeo = new THREE.IcosahedronGeometry(4.4, 1);
    for (let i = 0; i < 24; i++) {
      const cluster = new THREE.Group();
      const angle = (i / 24) * Math.PI * 2;
      const dist = 24 + (i % 4) * 14;
      cluster.position.set(Math.cos(angle) * dist, -6.2 - (i % 3) * 1.3, Math.sin(angle) * dist);
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set((j - 1) * 3.9, (j % 2) * 0.6, ((j + i) % 2) * 2.1);
        puff.scale.set(1.5, 0.42, 1.3);
        cluster.add(puff);
      }
      this.cloudClusters.push(cluster);
      this.scene.add(cluster);
    }
  }

  private buildMayCharacter(): {
    bodyMat: THREE.MeshStandardMaterial;
    lanternLight: THREE.PointLight;
    footGeo: THREE.BufferGeometry;
    footMat: THREE.Material;
    armGeo: THREE.BufferGeometry;
    armMat: THREE.Material;
  } {
    this.mayGroup.add(this.mayVisualPivot);

    // 1. Boots (neatly tucked under skirt hem)
    const footGeo = new THREE.CapsuleGeometry(0.09, 0.12, 4, 8);
    const footMat = new THREE.MeshStandardMaterial({ color: '#33254a', roughness: 0.78 });
    this.mayLeftFoot.position.set(-0.14, 0.13, 0);
    this.mayRightFoot.position.set(0.14, 0.13, 0);
    this.mayVisualPivot.add(this.mayLeftFoot, this.mayRightFoot);

    // 2. Clean non-intersecting Cream Skirt (y = 0.18..0.70) + Indigo Upper Tunic (y = 0.70..1.04)
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#f3e5cb', roughness: 0.65 });
    const skirtProfile = [
      new THREE.Vector2(0.41, 0.18),
      new THREE.Vector2(0.35, 0.42),
      new THREE.Vector2(0.21, 0.70),
      new THREE.Vector2(0.0, 0.70)
    ];
    const skirt = new THREE.Mesh(new THREE.LatheGeometry(skirtProfile, 20), bodyMat);
    this.mayVisualPivot.add(skirt);

    const tunicMat = new THREE.MeshStandardMaterial({ color: '#3f346e', roughness: 0.72 });
    const upperTunic = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.215, 0.35, 20), tunicMat);
    upperTunic.position.y = 0.875;
    this.mayVisualPivot.add(upperTunic);

    // Golden waist sash & soft neck collar (no protruding box!)
    const goldSashMat = new THREE.MeshStandardMaterial({
      color: '#f5a63d',
      emissive: '#4d2600',
      roughness: 0.55
    });
    const waistBelt = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.032, 8, 20), goldSashMat);
    waistBelt.rotation.x = Math.PI / 2;
    waistBelt.position.y = 0.705;
    this.mayVisualPivot.add(waistBelt);

    const neckCollar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.036, 8, 18), goldSashMat);
    neckCollar.rotation.x = Math.PI / 2;
    neckCollar.position.y = 1.06;
    this.mayVisualPivot.add(neckCollar);

    // 3. Arms/Sleeves cleanly attached at shoulders
    const armGeo = new THREE.CapsuleGeometry(0.065, 0.2, 4, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: '#4e4282', roughness: 0.72 });
    this.mayLeftArm.position.set(-0.24, 0.88, 0.02);
    this.mayLeftArm.rotation.z = 0.28;
    this.mayRightArm.position.set(0.24, 0.88, 0.02);
    this.mayRightArm.rotation.z = -0.28;
    this.mayVisualPivot.add(this.mayLeftArm, this.mayRightArm);

    // 4. Head + Hair bob visible cleanly under the Nón Lá
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 18, 16),
      new THREE.MeshStandardMaterial({ color: '#ffe3c7', roughness: 0.6 })
    );
    head.position.y = 1.24;
    this.mayVisualPivot.add(head);

    const hairMat = new THREE.MeshStandardMaterial({ color: '#241b38', roughness: 0.85 });
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 14), hairMat);
    hairBack.position.set(0, 1.26, -0.045);
    this.mayVisualPivot.add(hairBack);

    const eyeGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#241838' });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.08, 1.24, 0.205);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.08, 1.24, 0.205);
    this.mayVisualPivot.add(eyeL, eyeR);

    // 5. Crafted Woven Nón Lá + Rim
    const hatMat = new THREE.MeshStandardMaterial({ color: '#eccb82', roughness: 0.72 });
    const nonLa = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.34, 24), hatMat);
    nonLa.position.y = 1.49;
    this.mayVisualPivot.add(nonLa);

    const hatRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.026, 8, 24),
      new THREE.MeshStandardMaterial({ color: '#9c6e38', roughness: 0.8 })
    );
    hatRim.rotation.x = Math.PI / 2;
    hatRim.position.y = 1.32;
    this.mayVisualPivot.add(hatRim);

    // 6. Compact, ornate hanging mini-lantern suspended neatly from hat brim
    this.mayLanternPivot.position.set(-0.56, 1.32, 0.12);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6),
      new THREE.MeshBasicMaterial({ color: '#c4965a' })
    );
    cord.position.y = -0.1;
    this.mayLanternPivot.add(cord);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, 0.05, 8),
      new THREE.MeshStandardMaterial({ color: '#593d2b', roughness: 0.7 })
    );
    cap.position.y = -0.21;
    this.mayLanternPivot.add(cap);

    const miniLantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.075, 0.14, 10),
      new THREE.MeshBasicMaterial({ color: '#ffd975' })
    );
    miniLantern.position.y = -0.30;
    this.mayLanternPivot.add(miniLantern);

    const bottomRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.05, 0.03, 8),
      new THREE.MeshStandardMaterial({ color: '#593d2b', roughness: 0.7 })
    );
    bottomRim.position.y = -0.38;
    this.mayLanternPivot.add(bottomRim);

    const lanternHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: '#ffb649',
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    lanternHalo.scale.set(0.7, 0.7, 1);
    lanternHalo.position.y = -0.30;
    this.mayLanternPivot.add(lanternHalo);

    const lanternLight = new THREE.PointLight('#ff9e3d', 3.0, 13, 1.45);
    lanternLight.position.y = -0.30;
    this.mayLanternPivot.add(lanternLight);

    this.mayVisualPivot.add(this.mayLanternPivot);
    return { bodyMat, lanternLight, footGeo, footMat, armGeo, armMat };
  }

  private createLanternVisual(id: string, pos: Vec3): void {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const stoneMat = new THREE.MeshStandardMaterial({ color: '#524c75', roughness: 0.82 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: '#3b2b42', roughness: 0.8 });

    const stepBase = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 0.32, 8), stoneMat);
    stepBase.position.y = 0.16;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.92, 0.4, 8), stoneMat);
    base.position.y = 0.52;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.3, 2.0, 8), stoneMat);
    pillar.position.y = 1.72;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.95), darkWoodMat);
    collar.position.y = 2.75;
    group.add(stepBase, base, pillar, collar);

    const coreMat = new THREE.MeshStandardMaterial({
      color: '#786aa8',
      emissive: '#4d3b82',
      emissiveIntensity: 0.55,
      roughness: 0.3
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.54, 0), coreMat);
    core.position.y = 3.25;
    group.add(core);

    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.45, 8), darkWoodMat);
    roof1.position.y = 3.82;
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.42, 8), stoneMat);
    roof2.position.y = 4.16;
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.45, 6),
      new THREE.MeshStandardMaterial({ color: '#ffca66', emissive: '#593b00', roughness: 0.4 })
    );
    spire.position.y = 4.55;
    group.add(roof1, roof2, spire);

    const flameMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#ffd978' })
    );
    flameMesh.position.y = 3.25;
    flameMesh.visible = false;
    group.add(flameMesh);

    const flameHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: '#ffb74d',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    flameHalo.scale.set(2.8, 2.8, 1);
    flameHalo.position.y = 3.25;
    group.add(flameHalo);

    const light = new THREE.PointLight('#ffa23a', 0, 22, 1.45);
    light.position.y = 3.3;
    group.add(light);

    const safeRingMat = new THREE.MeshBasicMaterial({
      color: '#ffc466',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(TUNING.safe_radius - 0.16, TUNING.safe_radius, 56),
      safeRingMat
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.05;
    group.add(safeRing);

    const innerRingMat = new THREE.MeshBasicMaterial({
      color: '#ffdf8e',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    const innerRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(TUNING.safe_radius - 0.7, TUNING.safe_radius - 0.56, 16),
      innerRingMat
    );
    innerRingMesh.rotation.x = -Math.PI / 2;
    innerRingMesh.position.y = 0.045;
    group.add(innerRingMesh);

    const crystalMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const c = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.52, 5),
        new THREE.MeshStandardMaterial({
          color: '#463d6e',
          emissive: '#ffaa44',
          emissiveIntensity: 0.1
        })
      );
      c.position.set(Math.cos(a) * 1.48, 0.25, Math.sin(a) * 1.48);
      group.add(c);
      crystalMeshes.push(c);
    }

    const orbitMotes: THREE.Mesh[] = [];
    for (let i = 0; i < TUNING.lantern_cost; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 8, 6),
        new THREE.MeshBasicMaterial({ color: '#ffd966' })
      );
      m.visible = false;
      group.add(m);
      orbitMotes.push(m);
    }

    this.lanternVisuals.set(id, {
      group,
      coreMat,
      flameMesh,
      flameHalo,
      light,
      safeRingMat,
      innerRingMesh,
      innerRingMat,
      crystalMeshes,
      orbitMotes
    });
    this.scene.add(group);
  }

  private createMoteVisual(id: string): THREE.Group {
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.moteCoreGeo, this.moteCoreMat);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: '#ffbe4d',
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    halo.scale.set(1.05, 1.05, 1);
    group.add(core, halo);
    this.moteVisuals.set(id, group);
    this.scene.add(group);
    return group;
  }

  private createShadeVisual(id: string): ShadeVisual {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#11061e',
      emissive: '#3b1263',
      emissiveIntensity: 0.9,
      roughness: 0.45
    });

    // Pure seamless 3D teardrop phantom silhouette (no 2D sprite overlay!)
    const phantomProfile = [
      new THREE.Vector2(0.0, -0.78),
      new THREE.Vector2(0.12, -0.58),
      new THREE.Vector2(0.32, -0.32),
      new THREE.Vector2(0.50, -0.02),
      new THREE.Vector2(0.52, 0.25),
      new THREE.Vector2(0.38, 0.50),
      new THREE.Vector2(0.16, 0.66),
      new THREE.Vector2(0.0, 0.72)
    ];
    const body = new THREE.Mesh(new THREE.LatheGeometry(phantomProfile, 22), bodyMat);
    group.add(body);

    // Subtle swept shadow ear-wisps on crown
    const hornGeo = new THREE.ConeGeometry(0.14, 0.42, 8);
    const hornL = new THREE.Mesh(hornGeo, bodyMat);
    hornL.position.set(-0.22, 0.65, -0.05);
    hornL.rotation.set(-0.35, 0, 0.35);
    const hornR = new THREE.Mesh(hornGeo, bodyMat);
    hornR.position.set(0.22, 0.65, -0.05);
    hornR.rotation.set(-0.35, 0, -0.35);
    group.add(hornL, hornR);

    // Slanted glowing violet phantom eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ec82ff' });
    const eyeGeo = new THREE.SphereGeometry(0.08, 10, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.18, 0.22, 0.46);
    eyeL.scale.set(1.25, 0.75, 0.65);
    eyeL.rotation.z = -0.22;
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.18, 0.22, 0.46);
    eyeR.scale.set(1.25, 0.75, 0.65);
    eyeR.rotation.z = 0.22;
    group.add(eyeL, eyeR);

    // 3 flowing lower shadow wisps orbiting below tail
    const wisps: THREE.Mesh[] = [];
    const wispGeo = new THREE.ConeGeometry(0.09, 0.36, 7);
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(wispGeo, bodyMat);
      w.rotation.x = Math.PI;
      group.add(w);
      wisps.push(w);
    }

    const stunStarsGroup = new THREE.Group();
    stunStarsGroup.position.y = 1.05;
    const starGeo = new THREE.OctahedronGeometry(0.11, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: '#ffe066' });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const star = new THREE.Mesh(starGeo, starMat);
      star.position.set(Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52);
      stunStarsGroup.add(star);
    }
    stunStarsGroup.visible = false;
    group.add(stunStarsGroup);

    const visual: ShadeVisual = { group, bodyMat, eyeMat, wisps, stunStarsGroup };
    this.shadeVisuals.set(id, visual);
    this.scene.add(group);
    return visual;
  }

  sync(state: SimState, events: ReadonlyArray<SimEvent>, opts: RenderSyncOptions): Vec3 {
    const { alpha, simDt, frameDt, elapsedSec, isMovingInput, prevPlayerPos, prevShadePositions } = opts;
    const p = state.player;
    const renderPlayerPos = interpolatePos(prevPlayerPos, p.pos, alpha);

    // 1. Update Mây smoothly (zero 0-tick stutter!)
    this.mayGroup.position.set(renderPlayerPos[0], renderPlayerPos[1], renderPlayerPos[2]);
    const targetYaw = Math.atan2(p.facing[0], p.facing[1]);
    this.mayGroup.rotation.y =
      frameDt > 0
        ? unwrapAngleRad(this.mayGroup.rotation.y, targetYaw, 1 - Math.exp(-16 * frameDt))
        : targetYaw;

    const targetMove = isMovingInput && p.pos[1] === 0 ? 1 : 0;
    const blendAlpha = frameDt > 0 ? 1 - Math.exp(-14 * frameDt) : 1;
    this.moveBlend += (targetMove - this.moveBlend) * blendAlpha;

    if (simDt > 0) {
      this.walkPhase += simDt * 13 * Math.max(0.2, this.moveBlend);
    }

    const strideSin = Math.sin(this.walkPhase);
    const walkBob = Math.abs(strideSin) * 0.06 * this.moveBlend;
    const idleBob = Math.sin(elapsedSec * 2.6) * 0.02 * (1 - this.moveBlend);

    this.mayVisualPivot.position.y = walkBob + idleBob;
    this.mayVisualPivot.rotation.x = 0.08 * this.moveBlend;
    this.mayLeftFoot.position.z = strideSin * 0.22 * this.moveBlend;
    this.mayRightFoot.position.z = -strideSin * 0.22 * this.moveBlend;
    this.mayLeftArm.rotation.x = -strideSin * 0.45 * this.moveBlend;
    this.mayRightArm.rotation.x = strideSin * 0.45 * this.moveBlend;

    if (targetMove > 0 && simDt > 0) {
      this.dustCooldown -= simDt;
      if (this.dustCooldown <= 0) {
        this.dustCooldown = 0.16;
        this.vfx.spawnDust(renderPlayerPos);
      }
    }

    this.mayLanternPivot.rotation.z =
      Math.sin(elapsedSec * 4.8) * (0.08 + 0.08 * this.moveBlend);
    this.mayLanternPivot.rotation.x = -0.14 * this.moveBlend + Math.cos(elapsedSec * 3.1) * 0.04;
    this.mayLanternLight.intensity = 2.9 + Math.sin(elapsedSec * 8) * 0.25;
    this.mayBodyMat.emissive.setHex(
      p.invulnRemaining > 0 && Math.floor(elapsedSec * 14) % 2 === 0 ? 0xff5a5a : 0x000000
    );

    // 2. Update 5 Great Lanterns & progressive island illumination
    let litCount = 0;
    for (const l of state.lanterns) {
      if (l.lit) litCount += 1;
      const vis = this.lanternVisuals.get(l.id);
      if (!vis) continue;
      vis.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      const ratio = Math.min(1, l.deposited / TUNING.lantern_cost);

      vis.orbitMotes.forEach((m, idx) => {
        m.visible = !l.lit && idx < l.deposited;
        if (m.visible) {
          const a = elapsedSec * 2.4 + (idx / Math.max(1, l.deposited)) * Math.PI * 2;
          m.position.set(Math.cos(a) * 0.85, 3.2 + Math.sin(elapsedSec * 4 + idx) * 0.12, Math.sin(a) * 0.85);
        }
      });

      if (l.lit) {
        vis.coreMat.color.set('#ffd97a');
        vis.coreMat.emissive.set('#ff9b26');
        vis.coreMat.emissiveIntensity = 1.6;
        vis.flameMesh.visible = true;
        vis.flameMesh.scale.setScalar(0.95 + Math.sin(elapsedSec * 8) * 0.1);
        vis.flameHalo.material.opacity = 0.72 + Math.sin(elapsedSec * 6) * 0.1;
        vis.light.intensity = 6.8 + Math.sin(elapsedSec * 6) * 0.45;
        vis.safeRingMat.opacity = 0.48 + Math.sin(elapsedSec * 3) * 0.1;
        vis.innerRingMat.opacity = 0.3;
        vis.innerRingMesh.rotation.z = elapsedSec * 0.35;
        vis.crystalMeshes.forEach((c) => {
          (c.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.05;
        });
      } else {
        vis.coreMat.color.set('#786aa8');
        vis.coreMat.emissive.set(ratio > 0 ? '#ff9d3b' : '#4d3b82');
        vis.coreMat.emissiveIntensity = 0.5 + ratio * 0.9;
        vis.flameMesh.visible = false;
        vis.flameHalo.material.opacity = ratio * 0.3;
        vis.light.intensity = ratio * 2.0;
        vis.safeRingMat.opacity = 0;
        vis.innerRingMat.opacity = 0;
        vis.crystalMeshes.forEach((c) => {
          (c.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1 + ratio * 0.35;
        });
      }
    }

    const warmFactor = litCount / TUNING.lantern_count_night1;
    (this.scene.background as THREE.Color).lerpColors(this.darkBg, this.warmBg, warmFactor);
    this.fog.color.lerpColors(this.darkFog, this.warmFog, warmFactor);
    this.fog.density = 0.0125 - warmFactor * 0.0045;
    this.hemiLight.intensity = 0.94 + warmFactor * 0.55;
    this.dirLight.intensity = 0.8 + warmFactor * 0.5;

    // 3. Sync Motes
    const activeMoteIds = new Set<string>();
    for (const m of state.motes) {
      activeMoteIds.add(m.id);
      const vis = this.moteVisuals.get(m.id) ?? this.createMoteVisual(m.id);
      const bob = 0.65 + Math.sin(elapsedSec * 3.6 + m.pos[0] * 0.7) * 0.18;
      vis.position.set(m.pos[0], bob, m.pos[2]);
    }
    for (const [id, vis] of this.moteVisuals.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(vis);
        const halo = vis.children[1] as THREE.Sprite | undefined;
        halo?.material.dispose();
        this.moteVisuals.delete(id);
      }
    }

    // 4. Sync Shades with interpolated positions (zero 2D overlay sprite!)
    const activeShadeIds = new Set<string>();
    for (const s of state.shades) {
      activeShadeIds.add(s.id);
      const vis = this.shadeVisuals.get(s.id) ?? this.createShadeVisual(s.id);
      const prevShade = prevShadePositions.get(s.id) ?? s.pos;
      const renderShadePos = interpolatePos(prevShade, s.pos, alpha);
      const hover = s.state === 'stunned' ? -0.1 : Math.sin(elapsedSec * 4.5 + s.pos[0]) * 0.14;
      vis.group.position.set(renderShadePos[0], renderShadePos[1] + hover, renderShadePos[2]);
      vis.group.rotation.y = Math.atan2(
        renderPlayerPos[0] - renderShadePos[0],
        renderPlayerPos[2] - renderShadePos[2]
      );

      vis.wisps.forEach((w, idx) => {
        const a = elapsedSec * (s.state === 'stunned' ? 0.8 : 3.0) + (idx / 3) * Math.PI * 2;
        const r = s.state === 'stunned' ? 0.3 : 0.42;
        w.position.set(Math.cos(a) * r, -0.52 + Math.sin(elapsedSec * 4 + idx) * 0.1, Math.sin(a) * r);
      });

      if (s.state === 'stunned') {
        vis.bodyMat.color.set('#3d384f');
        vis.bodyMat.emissive.set('#6b531c');
        vis.eyeMat.color.set('#ffe27a');
        vis.stunStarsGroup.visible = true;
        vis.stunStarsGroup.rotation.y = elapsedSec * 5;
      } else {
        vis.bodyMat.color.set('#11061e');
        vis.bodyMat.emissive.set('#3b1263');
        vis.eyeMat.color.set('#ec82ff');
        vis.stunStarsGroup.visible = false;
      }
    }
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }

    // 5. Trigger event-driven VFX & update particles
    for (const ev of events) {
      if (ev.name === 'mote_picked') {
        this.vfx.spawnBurst(renderPlayerPos, 0xffe066, 10, 3.2, 3.4, 1.0);
      } else if (ev.name === 'deposit') {
        const target = state.lanterns.find((l) => l.id === ev.data.lantern_id);
        if (target) this.vfx.spawnDepositStream(renderPlayerPos, target.pos);
      } else if (ev.name === 'lantern_lit') {
        const target = state.lanterns.find((l) => l.id === ev.data.lantern_id);
        if (target) this.vfx.spawnLanternCelebration(target.pos);
      } else if (ev.name === 'pulse') {
        this.vfx.spawnPulseEffect(renderPlayerPos);
      } else if (ev.name === 'player_hit') {
        this.vfx.spawnBurst(
          renderPlayerPos,
          ev.data.by === 'fall' ? 0x82b7ff : 0xc44dff,
          16,
          4.5,
          2.5,
          1.15
        );
      }
    }
    this.vfx.update(simDt);

    // 6. Drift clouds and sway trees gently
    this.cloudClusters.forEach((c, idx) => {
      c.position.y = -6.2 - (idx % 3) * 1.3 + Math.sin(elapsedSec * 0.45 + idx) * 0.35;
    });
    this.treeCrowns.forEach((crown, idx) => {
      crown.rotation.z = Math.sin(elapsedSec * 1.3 + idx) * 0.03;
    });

    return renderPlayerPos;
  }

  dispose(): void {
    this.vfx.dispose();
    this.groundTex.dispose();
    this.warmGlowTex.dispose();
    this.moteCoreGeo.dispose();
    this.moteCoreMat.dispose();
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
