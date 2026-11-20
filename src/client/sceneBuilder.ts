import * as THREE from 'three';
import { FUEL_MAX_TICKS, LOW_FUEL_TICKS, TUNING } from '../sim/constants';
import { getMapConfig } from '../sim/maps';
import type { NightId, SimEvent, SimState, Vec3 } from '../sim/types';
import { computeAmbientIntensity, PALETTE } from './palette';
import { VfxManager } from './particles';
import { interpolatePos, unwrapAngleRad } from './renderMath';
import { createBambooBridgeTexture, createGlowTexture, createIslandGroundTexture } from './textures';

interface LanternVisual {
  group: THREE.Group;
  paperHeadGroup: THREE.Group;
  tearGroup: THREE.Group;
  fuelBarGroup: THREE.Group;
  fuelFillMesh: THREE.Mesh;
  fuelFillMat: THREE.MeshBasicMaterial;
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
  drainBeam: THREE.Mesh;
  drainBeamMat: THREE.MeshBasicMaterial;
}

interface DrifterVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  trailSegments: THREE.Mesh[];
  stolenOrbs: THREE.Mesh[];
}

interface CharmVisual {
  group: THREE.Group;
  scrollGroup: THREE.Group;
  halo: THREE.Sprite;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
}

interface JumpPadVisual {
  group: THREE.Group;
  chevron: THREE.Mesh;
  glowRing: THREE.Mesh;
}

export interface RenderSyncOptions {
  alpha: number;
  simDt: number;
  frameDt: number;
  elapsedSec: number;
  isMovingInput: boolean;
  colorblind?: boolean;
  cameraPos?: Vec3;
  prevPlayerPos: Vec3;
  prevShadePositions: ReadonlyMap<string, Vec3>;
  prevDrifterPositions: ReadonlyMap<string, Vec3>;
}

export class IslandScene {
  readonly scene = new THREE.Scene();
  private readonly night: NightId;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;
  private readonly vfx: VfxManager;

  private readonly disposableTextures: THREE.Texture[] = [];
  private readonly warmGlowTex: THREE.CanvasTexture;

  private readonly moteCoreGeo = new THREE.SphereGeometry(0.16, 10, 8);
  private readonly moteRandomMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteGlow });
  private readonly moteDroppedMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteGold });

  private readonly mayGroup = new THREE.Group();
  private readonly mayVisualPivot = new THREE.Group();
  private readonly mayLeftFoot = new THREE.Mesh();
  private readonly mayRightFoot = new THREE.Mesh();
  private readonly mayLeftArm = new THREE.Mesh();
  private readonly mayRightArm = new THREE.Mesh();
  private readonly mayLanternPivot = new THREE.Group();
  private readonly mayLanternLight: THREE.PointLight;
  private readonly mayBodyMat: THREE.MeshStandardMaterial;
  private readonly mayScarfTail = new THREE.Mesh();
  private readonly mayCharmAuraMat: THREE.MeshBasicMaterial;
  private readonly mayCharmAura: THREE.Mesh;

  private readonly cloudClusters: { group: THREE.Group; baseY: number }[] = [];
  private readonly treeCrowns: THREE.Group[] = [];
  private readonly jumpPadVisuals: JumpPadVisual[] = [];
  private bellPivot: THREE.Group | null = null;

  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteVisuals = new Map<string, THREE.Group>();
  private readonly shadeVisuals = new Map<string, ShadeVisual>();
  private readonly drifterVisuals = new Map<string, DrifterVisual>();
  private readonly charmVisuals = new Map<string, CharmVisual>();

  private moveBlend = 0;
  private walkPhase = 0;
  private dustCooldown = 0;
  private dashTrailCooldown = 0;
  private windParticleCooldown = 0;

  private readonly darkBg = new THREE.Color(PALETTE.skyDeep);
  private readonly warmBg = new THREE.Color(PALETTE.skyMid);
  private readonly darkFog = new THREE.Color(PALETTE.skyDeep);
  private readonly warmFog = new THREE.Color(PALETTE.skyMid);

  constructor(initialState: SimState) {
    this.night = initialState.night;
    this.warmGlowTex = createGlowTexture('rgba(255,246,194,1)', 'rgba(255,179,71,0.58)');
    this.disposableTextures.push(this.warmGlowTex);
    this.vfx = new VfxManager(this.scene);

    this.scene.background = this.darkBg.clone();
    this.fog = new THREE.FogExp2(this.darkFog.getHex(), 0.0085);
    this.scene.fog = this.fog;

    // Exact official ambient intensity formula: 0.15 + 0.55 * (lit / total)
    this.hemiLight = new THREE.HemisphereLight('#d6dcff', PALETTE.waterHex, computeAmbientIntensity(0, 1));
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight('#dfe5ff', 0.65);
    this.dirLight.position.set(24, 38, -20);
    this.scene.add(this.dirLight);

    this.buildEnvironmentForNight(this.night);
    this.buildSkyAndClouds();

    const mayParts = this.buildMayCharacter();
    this.mayBodyMat = mayParts.bodyMat;
    this.mayLanternLight = mayParts.lanternLight;
    this.mayCharmAuraMat = mayParts.charmAuraMat;
    this.mayCharmAura = mayParts.charmAura;
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
    for (const c of initialState.charms) {
      this.createCharmVisual(c.id, c.pos);
    }

    this.sync(initialState, [], {
      alpha: 1,
      simDt: 0,
      frameDt: 0,
      elapsedSec: 0,
      isMovingInput: false,
      prevPlayerPos: initialState.player.pos,
      prevShadePositions: new Map(),
      prevDrifterPositions: new Map()
    });
  }

  private buildEnvironmentForNight(night: NightId): void {
    const mapCfg = getMapConfig(night);

    // Deep night sea / twilight lagoon floor at Y = -10.5
    const waterGeo = new THREE.CircleGeometry(145, 48);
    const waterMat = new THREE.MeshStandardMaterial({
      color: PALETTE.water,
      roughness: 0.45,
      metalness: 0.28
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(night === 2 ? 35 : 0, -10.5, 0);
    this.scene.add(water);

    if (night === 1) {
      this.buildCircularIslandDisc(0, 40, 1, [0, 0]);
      this.buildPlaza(0, 0, 0);
      this.buildPier(0, 40 - 0.8);
      this.buildPerimeterStones(0, 0, 40, 22, true);
      this.buildPineTreesRing(0, 0, 29.5, 10);
    } else if (night === 2) {
      // Twin islands: A at (0,0,0) R=28, B at (70,0,0) R=28
      this.buildCircularIslandDisc(0, 28, 2, [0, 0]);
      this.buildCircularIslandDisc(70, 28, 2, [70, 0]);
      this.buildPlaza(0, 0, 0);
      this.buildPlaza(70, 0, 0);
      this.buildBambooBridge();
      this.buildPerimeterStones(0, 0, 28, 16, false, [26, 44]);
      this.buildPerimeterStones(70, 0, 28, 16, false, [26, 44]);
      this.buildArecaPalms(0, 0, 23, 7);
      this.buildArecaPalms(70, 0, 23, 7);
    } else {
      // Night 3: Đảo Chuông — Tier 0 (R=45, Y=0), Tier 1 (r∈[12..24], z>0, Y=3), Tier 2 (R=8, Y=6), 2 ramps, Bell Tower
      this.buildCircularIslandDisc(0, 45, 3, [0, 28]);
      this.buildPlaza(0, 0, 28, 3.6);
      this.buildNight3Tier1Terrace();
      this.buildNight3Tier2Sanctuary();
      this.buildNight3Ramp((30 * Math.PI) / 180);
      this.buildNight3Ramp((150 * Math.PI) / 180);
      this.buildBellTower();
      this.buildPerimeterStones(0, 0, 45, 24, false);
      this.buildPineTreesRing(0, 0, 38.5, 12);
    }

    for (const jp of mapCfg.jumpPads) {
      this.createJumpPadVisual(jp.pos);
    }
  }

  private buildCircularIslandDisc(
    centerX: number,
    radius: number,
    night: NightId,
    spawnLocal: [number, number]
  ): void {
    const tex = createIslandGroundTexture(night, radius, centerX, spawnLocal);
    this.disposableTextures.push(tex);

    const baseGeo = new THREE.CylinderGeometry(radius, radius * 0.95, 2.2, 64);
    const baseMat = new THREE.MeshStandardMaterial({
      color: '#20263a',
      roughness: 0.94,
      metalness: 0.04
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(centerX, -1.1, 0);
    this.scene.add(baseMesh);

    const surfaceGeo = new THREE.CircleGeometry(radius, 64);
    const surfaceMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.92,
      metalness: 0.04
    });
    const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfaceMesh.rotation.x = -Math.PI / 2;
    surfaceMesh.position.set(centerX, 0.008, 0);
    this.scene.add(surfaceMesh);

    const skirtGeo = new THREE.ConeGeometry(radius * 0.94, 9.5, 24, 1, true);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: '#1b2038',
      roughness: 0.96,
      flatShading: true
    });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.rotation.x = Math.PI;
    skirt.position.set(centerX, -6.9, 0);
    this.scene.add(skirt);

    const rimGeo = new THREE.RingGeometry(radius - 0.45, radius, 64);
    const rimMat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternWarm,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(centerX, 0.025, 0);
    this.scene.add(rim);
  }

  private buildPlaza(x: number, y: number, z: number, radius = 4.2): void {
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius + 0.3, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.85 })
    );
    plaza.position.set(x, y + 0.02, z);
    this.scene.add(plaza);
  }

  private buildPier(x: number, zStart: number): void {
    const pierGroup = new THREE.Group();
    pierGroup.position.set(x, 0.05, zStart);
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.86 });
    for (let i = 0; i < 6; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.55), woodMat);
      plank.position.set(0, 0, i * 0.72);
      pierGroup.add(plank);
    }
    for (const sx of [-1.45, 1.45]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 1.5, 8), woodMat);
      post.position.set(sx, 0.45, 3.6);
      const miniOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.lanternWarm })
      );
      miniOrb.position.set(sx, 1.25, 3.6);
      pierGroup.add(post, miniOrb);
    }
    this.scene.add(pierGroup);
  }

  private buildBambooBridge(): void {
    const bridgeTex = createBambooBridgeTexture();
    this.disposableTextures.push(bridgeTex);

    const group = new THREE.Group();
    // Deck spans x ∈ [26..44], z ∈ [-2..2], top flush at Y = 0
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(18.2, 0.28, 4.0),
      new THREE.MeshStandardMaterial({ map: bridgeTex, roughness: 0.84 })
    );
    deck.position.set(35, -0.14, 0);
    group.add(deck);

    const railMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });
    const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.15, 8);
    const supportGeo = new THREE.CylinderGeometry(0.16, 0.2, 10.5, 8);

    for (let px = 27; px <= 43; px += 4) {
      for (const pz of [-1.85, 1.85]) {
        const post = new THREE.Mesh(postGeo, railMat);
        post.position.set(px, 0.55, pz);
        group.add(post);

        const pylon = new THREE.Mesh(supportGeo, railMat);
        pylon.position.set(px, -5.25, pz);
        group.add(pylon);

        if (px === 31 || px === 35 || px === 39) {
          const ferryLamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 8, 6),
            new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
          );
          ferryLamp.position.set(px, 1.22, pz);
          group.add(ferryLamp);
        }
      }
    }

    for (const pz of [-1.85, 1.85]) {
      const railBar = new THREE.Mesh(new THREE.BoxGeometry(18.0, 0.09, 0.09), railMat);
      railBar.position.set(35, 0.92, pz);
      group.add(railBar);
    }

    this.scene.add(group);
  }

  private buildNight3Tier1Terrace(): void {
    // Exact half-annulus: r ∈ [12..24], z > 0, Y = 0..3.0
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 24.0, 0, Math.PI, false);
    shape.lineTo(-12.0, 0);
    shape.absarc(0, 0, 12.0, Math.PI, 0, true);
    shape.closePath();

    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 3.0,
      bevelEnabled: false,
      curveSegments: 42
    });
    const topMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ color: '#31374f', roughness: 0.94 });
    const tier1 = new THREE.Mesh(extrudeGeo, [topMat, wallMat]);
    // Rotate +90° around X: local +y -> +Z (z >= 0!), extrude +z [0..3] -> world Y = 3 - z [3..0]
    tier1.rotation.x = Math.PI / 2;
    tier1.position.y = 3.0;
    this.scene.add(tier1);

    // Warm sandy stone trim on Tier 1 rim
    const trimGeo = new THREE.RingGeometry(23.3, 24.05, 42, 1, Math.PI, Math.PI);
    const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.86 });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.rotation.x = -Math.PI / 2;
    trim.position.y = 3.015;
    this.scene.add(trim);
  }

  private buildNight3Tier2Sanctuary(): void {
    // Tier 2 solid plateau: R = 8m, Y = 0..6.0
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(8.0, 8.2, 6.0, 48),
      new THREE.MeshStandardMaterial({ color: '#323850', roughness: 0.94 })
    );
    wall.position.y = 3.0;
    this.scene.add(wall);

    const cap = new THREE.Mesh(
      new THREE.CircleGeometry(7.98, 48),
      new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.88 })
    );
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = 6.01;
    this.scene.add(cap);

    const outerRim = new THREE.Mesh(
      new THREE.RingGeometry(7.35, 8.0, 48),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.85, side: THREE.DoubleSide })
    );
    outerRim.rotation.x = -Math.PI / 2;
    outerRim.position.y = 6.02;
    this.scene.add(outerRim);
  }

  private buildNight3Ramp(angleRad: number): void {
    const ux = Math.cos(angleRad);
    const uz = Math.sin(angleRad);
    const rampLen = Math.hypot(6.0, 3.0);
    const slopeAngle = Math.atan2(3.0, 6.0);

    const group = new THREE.Group();
    group.position.set(27.0 * ux, 1.5, 27.0 * uz);
    group.rotation.y = -angleRad;

    const tilted = new THREE.Group();
    tilted.rotation.z = -slopeAngle;

    const plankMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.86 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(rampLen + 0.2, 0.24, 3.0), plankMat);
    deck.position.y = -0.12;
    tilted.add(deck);

    // Decorative wooden slats along ramp
    const slatMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.85 });
    for (let i = -3; i <= 3; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 2.75), slatMat);
      slat.position.set((i / 3.5) * (rampLen * 0.45), 0.02, 0);
      tilted.add(slat);
    }

    // Side rails on tilted ramp
    for (const sz of [-1.42, 1.42]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(rampLen + 0.1, 0.08, 0.08), plankMat);
      rail.position.set(0, 0.72, sz);
      tilted.add(rail);
    }
    group.add(tilted);

    // Vertical support pillars under ramp midpoint
    for (const sz of [-1.3, 1.3]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.2, 8), plankMat);
      pillar.position.set(0, -0.5, sz);
      group.add(pillar);
    }
    this.scene.add(group);
  }

  private buildBellTower(): void {
    // Solid collider is cylinder R = 2.0m at (0, 6..14, 0)
    const group = new THREE.Group();
    group.position.set(0, 6.0, 0);

    const stoneMat = new THREE.MeshStandardMaterial({ color: '#4c4e66', roughness: 0.84 });
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.78 });
    const roofMat = new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.75 });
    const goldMat = new THREE.MeshStandardMaterial({
      color: PALETTE.goldUi,
      emissive: '#593b00',
      roughness: 0.42
    });

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.98, 2.05, 1.2, 8), stoneMat);
    plinth.position.y = 0.6;
    group.add(plinth);

    const lowerBody = new THREE.Mesh(new THREE.CylinderGeometry(1.68, 1.85, 2.0, 8), stoneMat);
    lowerBody.position.y = 2.2;
    group.add(lowerBody);

    // Open upper belfry columns
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.8, 8), woodMat);
      col.position.set(Math.cos(a) * 1.25, 4.5, Math.sin(a) * 1.25);
      group.add(col);
    }

    // Suspended bronze bell
    const bellPivot = new THREE.Group();
    bellPivot.position.y = 5.4;
    const bellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 1.05, 14), goldMat);
    bellBody.position.y = -0.65;
    bellPivot.add(bellBody);
    group.add(bellPivot);
    this.bellPivot = bellPivot;

    // Two tiered pagoda eaves reaching total H = 8.0m (Y = 14)
    const eaves1 = new THREE.Mesh(new THREE.ConeGeometry(2.35, 1.15, 8), roofMat);
    eaves1.position.y = 6.2;
    const eaves2 = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.15, 8), woodMat);
    eaves2.position.y = 7.15;
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), goldMat);
    finial.position.y = 7.9;
    group.add(eaves1, eaves2, finial);

    this.scene.add(group);
  }

  private buildPerimeterStones(
    cx: number,
    cz: number,
    radius: number,
    count: number,
    skipPierSouth: boolean,
    bridgeGapXRange?: [number, number]
  ): void {
    const stoneGeo = new THREE.DodecahedronGeometry(0.7, 0);
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#43485c',
      roughness: 0.9,
      flatShading: true
    });
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.14;
      if (skipPierSouth && Math.abs(a - Math.PI / 2) < 0.2) continue;
      const x = cx + Math.cos(a) * (radius - 0.9);
      const z = cz + Math.sin(a) * (radius - 0.9);
      if (bridgeGapXRange && x > 24 && x < 46 && Math.abs(z) < 3.4) continue;

      const stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.position.set(x, 0.18, z);
      stone.rotation.y = a * 2;
      stone.scale.set(1.2, 0.65 + (i % 3) * 0.18, 1.0);
      this.scene.add(stone);
    }
  }

  private buildPineTreesRing(cx: number, cz: number, distBase: number, count: number): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.92 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: '#22473d',
      emissive: '#0c1f1a',
      roughness: 0.85,
      flatShading: true
    });
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.31;
      const dist = distBase + (i % 2) * 2.5;
      const tree = new THREE.Group();
      tree.position.set(cx + Math.cos(angle) * dist, 0, cz + Math.sin(angle) * dist);

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

  private buildArecaPalms(cx: number, cz: number, dist: number, count: number): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7d694e', roughness: 0.9 });
    const frondMat = new THREE.MeshStandardMaterial({
      color: PALETTE.grass,
      emissive: '#10261f',
      roughness: 0.8,
      flatShading: true
    });
    const frondGeo = new THREE.ConeGeometry(0.32, 1.95, 4);

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.45;
      const px = cx + Math.cos(a) * dist;
      const pz = cz + Math.sin(a) * dist;
      if (px > 23 && px < 47 && Math.abs(pz) < 4) continue;

      const palm = new THREE.Group();
      palm.position.set(px, 0, pz);

      const h = 4.2 + (i % 3) * 0.55;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, h, 8), trunkMat);
      trunk.position.y = h / 2;
      trunk.rotation.z = ((i % 2) * 2 - 1) * 0.04;
      palm.add(trunk);

      const crown = new THREE.Group();
      crown.position.y = h;
      for (let f = 0; f < 6; f++) {
        const fa = (f / 6) * Math.PI * 2;
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.set(Math.cos(fa) * 0.75, 0.15, Math.sin(fa) * 0.75);
        frond.rotation.z = -Math.PI * 0.34;
        const holder = new THREE.Group();
        holder.rotation.y = fa;
        holder.add(frond);
        crown.add(holder);
      }
      palm.add(crown);
      this.treeCrowns.push(crown);
      this.scene.add(palm);
    }
  }

  private buildSkyAndClouds(): void {
    const moonGroup = new THREE.Group();
    moonGroup.position.set(-55, 48, 70);
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 22, 18),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
    );
    const moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: PALETTE.lanternWarm,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    moonGlow.scale.set(24, 24, 1);
    moonGroup.add(moonMesh, moonGlow);
    this.scene.add(moonGroup);

    const starCount = 460;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 82 + ((i * 41) % 58);
      const theta = i * 2.39996;
      const phi = 0.16 + ((i * 19) % 100) * 0.011;
      positions[i * 3] = r * Math.cos(theta) * Math.cos(phi);
      positions[i * 3 + 1] = Math.abs(r * Math.sin(phi)) + 10;
      positions[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: PALETTE.moteGlow,
      size: 0.7,
      transparent: true,
      opacity: 0.88
    });
    this.scene.add(new THREE.Points(starGeo, starMat));

    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#1b264a',
      emissive: '#0c1229',
      roughness: 0.98,
      flatShading: true
    });
    const puffGeo = new THREE.IcosahedronGeometry(4.4, 1);
    const centerX = this.night === 2 ? 35 : 0;
    for (let i = 0; i < 24; i++) {
      const cluster = new THREE.Group();
      const angle = (i / 24) * Math.PI * 2;
      const dist = 34 + (i % 4) * 18;
      const baseY = -6.2 - (i % 3) * 1.3;
      cluster.position.set(centerX + Math.cos(angle) * dist, baseY, Math.sin(angle) * dist);
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set((j - 1) * 3.9, (j % 2) * 0.6, ((j + i) % 2) * 2.1);
        puff.scale.set(1.5, 0.42, 1.3);
        cluster.add(puff);
      }
      this.cloudClusters.push({ group: cluster, baseY });
      this.scene.add(cluster);
    }
  }

  private buildMayCharacter(): {
    bodyMat: THREE.MeshStandardMaterial;
    lanternLight: THREE.PointLight;
    charmAuraMat: THREE.MeshBasicMaterial;
    charmAura: THREE.Mesh;
    footGeo: THREE.BufferGeometry;
    footMat: THREE.Material;
    armGeo: THREE.BufferGeometry;
    armMat: THREE.Material;
  } {
    this.mayGroup.add(this.mayVisualPivot);

    const footGeo = new THREE.CapsuleGeometry(0.09, 0.12, 4, 8);
    const footMat = new THREE.MeshStandardMaterial({ color: '#2b2438', roughness: 0.78 });
    this.mayLeftFoot.position.set(-0.14, 0.13, 0);
    this.mayRightFoot.position.set(0.14, 0.13, 0);
    this.mayVisualPivot.add(this.mayLeftFoot, this.mayRightFoot);

    // Official cloak palette: #E8E2D0 ivory-white cloak with #C8102E scarlet scarf & trim
    const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.mayCloak, roughness: 0.62 });
    const skirtProfile = [
      new THREE.Vector2(0.41, 0.18),
      new THREE.Vector2(0.35, 0.42),
      new THREE.Vector2(0.21, 0.70),
      new THREE.Vector2(0.0, 0.70)
    ];
    const skirt = new THREE.Mesh(new THREE.LatheGeometry(skirtProfile, 20), bodyMat);
    this.mayVisualPivot.add(skirt);

    const upperTunic = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.215, 0.35, 20), bodyMat);
    upperTunic.position.y = 0.875;
    this.mayVisualPivot.add(upperTunic);

    const scarfMat = new THREE.MeshStandardMaterial({
      color: PALETTE.mayScarf,
      emissive: '#38040e',
      roughness: 0.55
    });
    const waistBelt = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.032, 8, 20), scarfMat);
    waistBelt.rotation.x = Math.PI / 2;
    waistBelt.position.y = 0.705;
    this.mayVisualPivot.add(waistBelt);

    const neckScarf = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.04, 8, 18), scarfMat);
    neckScarf.rotation.x = Math.PI / 2;
    neckScarf.position.y = 1.06;
    this.mayVisualPivot.add(neckScarf);

    this.mayScarfTail.geometry = new THREE.BoxGeometry(0.11, 0.03, 0.34);
    this.mayScarfTail.material = scarfMat;
    this.mayScarfTail.position.set(0.04, 1.02, -0.22);
    this.mayVisualPivot.add(this.mayScarfTail);

    const armGeo = new THREE.CapsuleGeometry(0.065, 0.2, 4, 8);
    const armMat = bodyMat;
    this.mayLeftArm.position.set(-0.24, 0.88, 0.02);
    this.mayLeftArm.rotation.z = 0.28;
    this.mayRightArm.position.set(0.24, 0.88, 0.02);
    this.mayRightArm.rotation.z = -0.28;
    this.mayVisualPivot.add(this.mayLeftArm, this.mayRightArm);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 18, 16),
      new THREE.MeshStandardMaterial({ color: '#ffe3c7', roughness: 0.6 })
    );
    head.position.y = 1.24;
    this.mayVisualPivot.add(head);

    const hairBack = new THREE.Mesh(
      new THREE.SphereGeometry(0.225, 16, 14),
      new THREE.MeshStandardMaterial({ color: '#241b38', roughness: 0.85 })
    );
    hairBack.position.set(0, 1.26, -0.045);
    this.mayVisualPivot.add(hairBack);

    const eyeGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#1b1426' });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.08, 1.24, 0.205);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.08, 1.24, 0.205);
    this.mayVisualPivot.add(eyeL, eyeR);

    // Nón Lá woven conical hat + warm brim
    const nonLa = new THREE.Mesh(
      new THREE.ConeGeometry(0.66, 0.34, 24),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.72 })
    );
    nonLa.position.y = 1.49;
    this.mayVisualPivot.add(nonLa);

    const hatRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.026, 8, 24),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.8 })
    );
    hatRim.rotation.x = Math.PI / 2;
    hatRim.position.y = 1.32;
    this.mayVisualPivot.add(hatRim);

    // Hanging mini-lantern under hat brim
    this.mayLanternPivot.position.set(-0.56, 1.32, 0.12);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.sand })
    );
    cord.position.y = -0.1;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, 0.05, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.7 })
    );
    cap.position.y = -0.21;
    const miniLantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.075, 0.14, 10),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
    );
    miniLantern.position.y = -0.30;
    const bottomRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.05, 0.03, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.7 })
    );
    bottomRim.position.y = -0.38;

    const lanternHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: PALETTE.lanternWarm,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    lanternHalo.scale.set(0.75, 0.75, 1);
    lanternHalo.position.y = -0.30;

    const lanternLight = new THREE.PointLight(PALETTE.lanternWarm, 3.2, 16, 1.4);
    lanternLight.position.y = -0.30;
    this.mayLanternPivot.add(cord, cap, miniLantern, bottomRim, lanternHalo, lanternLight);
    this.mayVisualPivot.add(this.mayLanternPivot);

    // Wind Charm swirling aura ring at Mây's feet
    const charmAuraMat = new THREE.MeshBasicMaterial({
      color: PALETTE.goldUi,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    const charmAura = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 28), charmAuraMat);
    charmAura.rotation.x = -Math.PI / 2;
    charmAura.position.y = 0.08;
    charmAura.visible = false;
    this.mayVisualPivot.add(charmAura);

    return { bodyMat, lanternLight, charmAuraMat, charmAura, footGeo, footMat, armGeo, armMat };
  }

  private createLanternVisual(id: string, pos: Vec3): void {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const stoneMat = new THREE.MeshStandardMaterial({ color: PALETTE.lanternUnlit, roughness: 0.82 });
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.8 });

    const stepBase = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 0.32, 8), stoneMat);
    stepBase.position.y = 0.16;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.92, 0.4, 8), stoneMat);
    base.position.y = 0.52;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.3, 2.0, 8), stoneMat);
    pillar.position.y = 1.72;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.95), woodMat);
    collar.position.y = 2.75;
    group.add(stepBase, base, pillar, collar);

    const coreMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lanternUnlit,
      emissive: '#34384a',
      emissiveIntensity: 0.4,
      roughness: 0.3
    });

    // Upper paper cage + eaves pivoted at collar (y = 2.84) so unlit squashes cleanly by 20%
    const paperHeadGroup = new THREE.Group();
    paperHeadGroup.position.y = 2.84;

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.54, 0), coreMat);
    core.position.y = 0.41;
    paperHeadGroup.add(core);

    // Visible torn-paper slashes proud of all 4 octahedron faces when unlit
    const tearGroup = new THREE.Group();
    tearGroup.position.y = 0.41;
    const tearMat = new THREE.MeshBasicMaterial({ color: '#0f1320' });
    const slashGeo = new THREE.BoxGeometry(0.56, 0.075, 0.06);
    for (let i = 0; i < 4; i++) {
      const a = ((i + 0.5) / 4) * Math.PI * 2;
      const slashA = new THREE.Mesh(slashGeo, tearMat);
      slashA.position.set(Math.cos(a) * 0.41, 0.06, Math.sin(a) * 0.41);
      slashA.rotation.y = -a + Math.PI / 2;
      slashA.rotation.z = 0.44;
      const slashB = new THREE.Mesh(slashGeo, tearMat);
      slashB.position.set(Math.cos(a) * 0.41, -0.09, Math.sin(a) * 0.41);
      slashB.rotation.y = -a + Math.PI / 2;
      slashB.rotation.z = -0.38;
      tearGroup.add(slashA, slashB);
    }
    paperHeadGroup.add(tearGroup);

    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.45, 8), woodMat);
    roof1.position.y = 0.98;
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.42, 8), stoneMat);
    roof2.position.y = 1.32;
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.45, 6),
      new THREE.MeshStandardMaterial({ color: PALETTE.goldUi, emissive: '#593b00', roughness: 0.4 })
    );
    spire.position.y = 1.71;
    paperHeadGroup.add(roof1, roof2, spire);
    group.add(paperHeadGroup);

    // Floating 3D Fuel Gauge above spire when lantern is lit
    const fuelBarGroup = new THREE.Group();
    fuelBarGroup.position.y = 5.05;
    fuelBarGroup.visible = false;
    const fuelBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.56, 0.22),
      new THREE.MeshBasicMaterial({ color: '#0e1430', side: THREE.DoubleSide })
    );
    const fuelFillMat = new THREE.MeshBasicMaterial({ color: PALETTE.goldUi, side: THREE.DoubleSide });
    const fuelFillMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.13), fuelFillMat);
    fuelFillMesh.position.z = 0.015;
    const fuelFillBack = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.13), fuelFillMat);
    fuelFillBack.position.z = -0.015;
    fuelBarGroup.add(fuelBg, fuelFillMesh, fuelFillBack);
    group.add(fuelBarGroup);

    const flameMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
    );
    flameMesh.position.y = 3.25;
    flameMesh.visible = false;
    group.add(flameMesh);

    const flameHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: PALETTE.lanternWarm,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    flameHalo.scale.set(2.8, 2.8, 1);
    flameHalo.position.y = 3.25;
    group.add(flameHalo);

    const light = new THREE.PointLight(PALETTE.lanternWarm, 0, 22, 1.45);
    light.position.y = 3.3;
    group.add(light);

    const safeRingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternWarm,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(TUNING.safe_radius - 0.16, TUNING.safe_radius, 48),
      safeRingMat
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.05;
    group.add(safeRing);

    const innerRingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternCore,
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
          color: PALETTE.lanternUnlit,
          emissive: PALETTE.lanternWarm,
          emissiveIntensity: 0.1
        })
      );
      c.position.set(Math.cos(a) * 1.48, 0.25, Math.sin(a) * 1.48);
      group.add(c);
      crystalMeshes.push(c);
    }

    const orbitMotes: THREE.Mesh[] = [];
    const orbitGeo = new THREE.SphereGeometry(0.11, 8, 6);
    const orbitMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteGold });
    for (let i = 0; i < TUNING.lantern_cost; i++) {
      const m = new THREE.Mesh(orbitGeo, orbitMat);
      m.visible = false;
      group.add(m);
      orbitMotes.push(m);
    }

    this.lanternVisuals.set(id, {
      group,
      paperHeadGroup,
      tearGroup,
      fuelBarGroup,
      fuelFillMesh,
      fuelFillMat,
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

  private createJumpPadVisual(pos: Vec3): void {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.05, 0.14, 24),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.65 })
    );
    disc.position.y = 0.07;

    const glowRing = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.92, 24),
      new THREE.MeshBasicMaterial({
        color: PALETTE.goldUi,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      })
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.16;

    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.55, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteGlow })
    );
    chevron.position.y = 0.65;

    group.add(disc, glowRing, chevron);
    this.scene.add(group);
    this.jumpPadVisuals.push({ group, chevron, glowRing });
  }

  private createCharmVisual(id: string, pos: Vec3): void {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.58, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.lanternUnlit, roughness: 0.8 })
    );
    pedestal.position.y = 0.175;
    group.add(pedestal);

    const scrollGroup = new THREE.Group();
    scrollGroup.position.y = 1.05;
    const goldMat = new THREE.MeshStandardMaterial({
      color: PALETTE.goldUi,
      emissive: '#8f620a',
      emissiveIntensity: 0.7,
      roughness: 0.35
    });
    const scrollTag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.65, 0.08), goldMat);
    const scarletRibbon = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.16, 0.11),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.5 })
    );
    scrollGroup.add(scrollTag, scarletRibbon);
    group.add(scrollGroup);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: PALETTE.goldUi,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    halo.scale.set(1.6, 1.6, 1);
    halo.position.y = 1.05;
    group.add(halo);

    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.goldUi,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 24), ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.06;
    group.add(ringMesh);

    this.charmVisuals.set(id, { group, scrollGroup, halo, ringMesh, ringMat });
    this.scene.add(group);
  }

  private createMoteVisual(id: string, kind: 'random' | 'dropped'): THREE.Group {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      this.moteCoreGeo,
      kind === 'dropped' ? this.moteDroppedMat : this.moteRandomMat
    );
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: kind === 'dropped' ? PALETTE.goldUi : PALETTE.moteGold,
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
      color: PALETTE.shadeBody,
      emissive: '#260b4d',
      emissiveIntensity: 0.85,
      roughness: 0.45
    });

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
    const body = new THREE.Mesh(new THREE.LatheGeometry(phantomProfile, 20), bodyMat);
    group.add(body);

    const hornGeo = new THREE.ConeGeometry(0.14, 0.42, 8);
    const hornL = new THREE.Mesh(hornGeo, bodyMat);
    hornL.position.set(-0.22, 0.65, -0.05);
    hornL.rotation.set(-0.35, 0, 0.35);
    const hornR = new THREE.Mesh(hornGeo, bodyMat);
    hornR.position.set(0.22, 0.65, -0.05);
    hornR.rotation.set(-0.35, 0, -0.35);
    group.add(hornL, hornR);

    const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeEye });
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
    const starMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteGold });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const star = new THREE.Mesh(starGeo, starMat);
      star.position.set(Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52);
      stunStarsGroup.add(star);
    }
    stunStarsGroup.visible = false;
    group.add(stunStarsGroup);

    const beamGeo = new THREE.CylinderGeometry(0.055, 0.13, 1, 8);
    beamGeo.rotateX(Math.PI / 2);
    const drainBeamMat = new THREE.MeshBasicMaterial({
      color: PALETTE.shadeEye,
      transparent: true,
      opacity: 0.72
    });
    const drainBeam = new THREE.Mesh(beamGeo, drainBeamMat);
    drainBeam.visible = false;
    this.scene.add(drainBeam);

    const visual: ShadeVisual = {
      group,
      bodyMat,
      eyeMat,
      wisps,
      stunStarsGroup,
      drainBeam,
      drainBeamMat
    };
    this.shadeVisuals.set(id, visual);
    this.scene.add(group);
    return visual;
  }

  private createDrifterVisual(id: string): DrifterVisual {
    const group = new THREE.Group();
    // Steel-blue wind ribbon spirit (#8FA3B8)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.drifterSteel,
      emissive: '#38516b',
      emissiveIntensity: 0.75,
      roughness: 0.38
    });

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 10), bodyMat);
    head.rotation.x = Math.PI / 2;
    head.position.y = 0.25;
    group.add(head);

    const trailSegments: THREE.Mesh[] = [];
    const segGeo = new THREE.BoxGeometry(0.46, 0.08, 0.42);
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(segGeo, bodyMat);
      seg.position.set(0, 0.25, -0.38 - i * 0.36);
      seg.scale.set(1 - i * 0.14, 1, 1);
      group.add(seg);
      trailSegments.push(seg);
    }

    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.textLightHex });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.14, 0.32, 0.12);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.14, 0.32, 0.12);
    group.add(eyeL, eyeR);

    const stolenOrbs: THREE.Mesh[] = [];
    const orbGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const orbMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteGold });
    for (let i = 0; i < 3; i++) {
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.visible = false;
      group.add(orb);
      stolenOrbs.push(orb);
    }

    const visual: DrifterVisual = { group, bodyMat, trailSegments, stolenOrbs };
    this.drifterVisuals.set(id, visual);
    this.scene.add(group);
    return visual;
  }

  sync(state: SimState, events: ReadonlyArray<SimEvent>, opts: RenderSyncOptions): Vec3 {
    const {
      alpha,
      simDt,
      frameDt,
      elapsedSec,
      isMovingInput,
      colorblind = false,
      cameraPos,
      prevPlayerPos,
      prevShadePositions,
      prevDrifterPositions
    } = opts;
    const p = state.player;
    const renderPlayerPos = interpolatePos(prevPlayerPos, p.pos, alpha);

    // 1. Update Mây smoothly
    const waitingRespawn = p.fallWaitTicks > 0;
    this.mayGroup.visible = !waitingRespawn;
    this.mayGroup.position.set(renderPlayerPos[0], renderPlayerPos[1], renderPlayerPos[2]);
    const targetYaw = Math.atan2(p.facing[0], p.facing[1]);
    this.mayGroup.rotation.y =
      frameDt > 0
        ? unwrapAngleRad(this.mayGroup.rotation.y, targetYaw, 1 - Math.exp(-16 * frameDt))
        : targetYaw;

    const isDashing = p.dashTicksLeft > 0;
    const targetMove = isMovingInput && p.grounded && !isDashing ? 1 : 0;
    const blendAlpha = frameDt > 0 ? 1 - Math.exp(-14 * frameDt) : 1;
    this.moveBlend += (targetMove - this.moveBlend) * blendAlpha;

    if (simDt > 0) {
      this.walkPhase += simDt * 13 * Math.max(0.2, this.moveBlend);
    }

    const strideSin = Math.sin(this.walkPhase);
    const walkBob = Math.abs(strideSin) * 0.06 * this.moveBlend;
    const idleBob = Math.sin(elapsedSec * 2.6) * 0.02 * (1 - this.moveBlend);

    this.mayVisualPivot.position.y = walkBob + idleBob;
    this.mayVisualPivot.rotation.x = isDashing ? 0.28 : 0.08 * this.moveBlend;
    this.mayLeftFoot.position.z = strideSin * 0.22 * this.moveBlend;
    this.mayRightFoot.position.z = -strideSin * 0.22 * this.moveBlend;
    this.mayLeftArm.rotation.x = -strideSin * 0.45 * this.moveBlend;
    this.mayRightArm.rotation.x = strideSin * 0.45 * this.moveBlend;
    this.mayScarfTail.rotation.x =
      isDashing ? -0.35 : -0.15 * this.moveBlend + Math.sin(elapsedSec * 9) * 0.08;

    if (targetMove > 0 && simDt > 0) {
      this.dustCooldown -= simDt;
      if (this.dustCooldown <= 0) {
        this.dustCooldown = 0.16;
        this.vfx.spawnDust(renderPlayerPos);
      }
    }
    if (isDashing && simDt > 0) {
      this.dashTrailCooldown -= simDt;
      if (this.dashTrailCooldown <= 0) {
        this.dashTrailCooldown = 0.05;
        this.vfx.spawnDashTrail(renderPlayerPos, p.facing);
      }
    }

    this.mayLanternPivot.rotation.z =
      Math.sin(elapsedSec * 4.8) * (0.08 + 0.08 * this.moveBlend);
    this.mayLanternPivot.rotation.x = -0.14 * this.moveBlend + Math.cos(elapsedSec * 3.1) * 0.04;
    this.mayLanternLight.intensity = 3.0 + Math.sin(elapsedSec * 8) * 0.25;
    this.mayBodyMat.emissive.setHex(
      p.invulnTicks > 0 && Math.floor(elapsedSec * 14) % 2 === 0
        ? colorblind
          ? PALETTE.dangerCb
          : PALETTE.danger
        : 0x000000
    );

    if (p.charmTicks > 0) {
      this.mayCharmAura.visible = true;
      this.mayCharmAuraMat.opacity = 0.6 + Math.sin(elapsedSec * 10) * 0.2;
      this.mayCharmAura.rotation.z = elapsedSec * 4.5;
    } else {
      this.mayCharmAura.visible = false;
    }

    // 2. Update Lanterns & Official Ambient Intensity 0.15 + 0.55 * (lit / total)
    const blink1HzOn = Math.sin(elapsedSec * Math.PI * 2) >= 0;
    let litCount = 0;
    for (const l of state.lanterns) {
      if (l.lit) litCount += 1;
      const vis = this.lanternVisuals.get(l.id);
      if (!vis) continue;
      vis.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      const req = l.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
      const ratio = Math.min(1, l.deposited / Math.max(1, req));

      vis.orbitMotes.forEach((m, idx) => {
        m.visible = !l.lit && idx < l.deposited;
        if (m.visible) {
          const a = elapsedSec * 2.4 + (idx / Math.max(1, l.deposited)) * Math.PI * 2;
          m.position.set(
            Math.cos(a) * 0.85,
            3.2 + Math.sin(elapsedSec * 4 + idx) * 0.12,
            Math.sin(a) * 0.85
          );
        }
      });

      if (l.lit) {
        const fuelRatio = Math.max(0, Math.min(1, l.fuelTicks / FUEL_MAX_TICKS));
        const isLowFuel = l.fuelTicks < LOW_FUEL_TICKS;
        const pulseMult = isLowFuel ? (blink1HzOn ? 1.0 : 0.25) : 1.0;

        vis.paperHeadGroup.scale.set(1, 1, 1);
        vis.tearGroup.visible = false;

        vis.fuelBarGroup.visible = !isLowFuel || blink1HzOn;
        if (cameraPos) {
          vis.fuelBarGroup.rotation.y = Math.atan2(
            cameraPos[0] - l.pos[0],
            cameraPos[2] - l.pos[2]
          );
        }
        const barFillColor = isLowFuel
          ? colorblind
            ? PALETTE.dangerCb
            : PALETTE.danger
          : PALETTE.goldUi;
        vis.fuelFillMat.color.setHex(barFillColor);
        vis.fuelFillMesh.scale.x = Math.max(0.02, fuelRatio);
        vis.fuelFillMesh.position.x = -0.72 * (1 - Math.max(0.02, fuelRatio));
        const backBar = vis.fuelBarGroup.children[2] as THREE.Mesh;
        backBar.scale.x = vis.fuelFillMesh.scale.x;
        backBar.position.x = vis.fuelFillMesh.position.x;

        vis.coreMat.color.setHex(PALETTE.lanternCore);
        vis.coreMat.emissive.setHex(PALETTE.lanternWarm);
        vis.coreMat.emissiveIntensity = 1.6 * pulseMult;
        vis.flameMesh.visible = !isLowFuel || blink1HzOn;
        vis.flameMesh.scale.setScalar(0.95 + Math.sin(elapsedSec * 8) * 0.1);
        vis.flameHalo.material.opacity = (0.72 + Math.sin(elapsedSec * 6) * 0.1) * pulseMult;
        vis.light.intensity = (7.2 + Math.sin(elapsedSec * 6) * 0.45) * pulseMult;

        // Safe zone ring is active ONLY when fuel >= 30
        if (isLowFuel) {
          vis.safeRingMat.opacity = 0;
          vis.innerRingMat.opacity = 0;
        } else {
          vis.safeRingMat.opacity = 0.45 + Math.sin(elapsedSec * 3) * 0.1;
          vis.innerRingMat.opacity = 0.28;
          vis.innerRingMesh.rotation.z = elapsedSec * 0.35;
        }
        vis.crystalMeshes.forEach((c) => {
          (c.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0 * pulseMult;
        });
      } else {
        // Distinguish unlit lanterns without color: squashed 20% + torn paper slashes
        vis.paperHeadGroup.scale.set(1.06, 0.8, 1.06);
        vis.tearGroup.visible = true;
        vis.fuelBarGroup.visible = false;

        vis.coreMat.color.setHex(PALETTE.lanternUnlit);
        vis.coreMat.emissive.setHex(ratio > 0 ? PALETTE.lanternWarm : 0x2f3340);
        vis.coreMat.emissiveIntensity = 0.35 + ratio * 0.85;
        vis.flameMesh.visible = false;
        vis.flameHalo.material.opacity = ratio * 0.28;
        vis.light.intensity = ratio * 2.1;
        vis.safeRingMat.opacity = 0;
        vis.innerRingMat.opacity = 0;
        vis.crystalMeshes.forEach((c) => {
          (c.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.08 + ratio * 0.3;
        });
      }
    }

    const totalLanterns = Math.max(1, state.lanterns.length);
    const warmFactor = litCount / totalLanterns;
    (this.scene.background as THREE.Color).lerpColors(this.darkBg, this.warmBg, warmFactor);
    this.fog.color.lerpColors(this.darkFog, this.warmFog, warmFactor);
    this.fog.density = 0.0095 - warmFactor * 0.0035;
    this.hemiLight.intensity = computeAmbientIntensity(litCount, totalLanterns);
    this.dirLight.intensity = 0.55 + warmFactor * 0.4;

    // 3. Sync Motes at proper elevation pos[1]
    const activeMoteIds = new Set<string>();
    for (const m of state.motes) {
      activeMoteIds.add(m.id);
      const vis = this.moteVisuals.get(m.id) ?? this.createMoteVisual(m.id, m.kind);
      const bob = m.pos[1] + 0.65 + Math.sin(elapsedSec * 3.6 + m.pos[0] * 0.7) * 0.16;
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

    // 4. Sync Bùa Gió (Charms)
    for (const c of state.charms) {
      const vis = this.charmVisuals.get(c.id);
      if (!vis) continue;
      vis.scrollGroup.visible = c.available;
      vis.halo.visible = c.available;
      vis.ringMesh.visible = c.available;
      if (c.available) {
        vis.scrollGroup.position.y = 1.05 + Math.sin(elapsedSec * 3.2) * 0.16;
        vis.scrollGroup.rotation.y = elapsedSec * 1.9;
        vis.ringMesh.rotation.z = -elapsedSec * 1.4;
      }
    }

    // 5. Sync Jump Pads pulse animation
    this.jumpPadVisuals.forEach((jp, idx) => {
      jp.chevron.position.y = 0.6 + Math.sin(elapsedSec * 5 + idx) * 0.16;
      jp.chevron.rotation.y = elapsedSec * 2.2;
      jp.glowRing.scale.setScalar(0.95 + Math.sin(elapsedSec * 4 + idx) * 0.08);
    });

    // 6. Sync Shades with interpolated positions & state visuals
    const activeShadeIds = new Set<string>();
    for (const s of state.shades) {
      activeShadeIds.add(s.id);
      const vis = this.shadeVisuals.get(s.id) ?? this.createShadeVisual(s.id);
      const prevShade = prevShadePositions.get(s.id) ?? s.pos;
      const renderShadePos = interpolatePos(prevShade, s.pos, alpha);
      const spawnScale =
        s.state === 'spawning' ? Math.max(0.25, 1 - s.stateTicksLeft / 30) : 1.0;
      vis.group.scale.setScalar(spawnScale);
      const hover =
        s.state === 'stunned'
          ? -0.08
          : s.state === 'drain'
            ? 0.25 + Math.sin(elapsedSec * 9) * 0.12
            : Math.sin(elapsedSec * 4.5 + s.pos[0]) * 0.14;
      vis.group.position.set(renderShadePos[0], renderShadePos[1] + 0.9 + hover, renderShadePos[2]);

      const drainTarget =
        s.state === 'drain' && s.targetLanternId
          ? state.lanterns.find((l) => l.id === s.targetLanternId)
          : undefined;
      const lookTarget = drainTarget ? drainTarget.pos : renderPlayerPos;
      vis.group.rotation.y = Math.atan2(
        lookTarget[0] - renderShadePos[0],
        lookTarget[2] - renderShadePos[2]
      );
      vis.group.rotation.x = s.state === 'drain' ? 0.28 : 0;

      vis.wisps.forEach((w, idx) => {
        const a = elapsedSec * (s.state === 'stunned' ? 0.8 : 3.0) + (idx / 3) * Math.PI * 2;
        const r = s.state === 'stunned' ? 0.3 : 0.42;
        w.position.set(Math.cos(a) * r, -0.52 + Math.sin(elapsedSec * 4 + idx) * 0.1, Math.sin(a) * r);
      });

      const activeEyeHex = colorblind ? PALETTE.shadeEyeCb : PALETTE.shadeEye;
      const activeEmissiveHex = colorblind ? '#004870' : '#2b0d4d';
      if (s.state === 'drain' && drainTarget) {
        const sx = renderShadePos[0];
        const sy = renderShadePos[1] + 0.95 + hover;
        const sz = renderShadePos[2];
        const tx = drainTarget.pos[0];
        const ty = drainTarget.pos[1] + 3.25;
        const tz = drainTarget.pos[2];
        const dist = Math.hypot(tx - sx, ty - sy, tz - sz);
        vis.drainBeam.visible = dist > 0.05;
        if (vis.drainBeam.visible) {
          vis.drainBeam.position.set((sx + tx) * 0.5, (sy + ty) * 0.5, (sz + tz) * 0.5);
          vis.drainBeam.lookAt(tx, ty, tz);
          const pulse = 1 + Math.sin(elapsedSec * 14) * 0.22;
          vis.drainBeam.scale.set(pulse, pulse, dist);
          vis.drainBeamMat.color.setHex(activeEyeHex);
          vis.drainBeamMat.opacity = 0.48 + 0.28 * Math.sin(elapsedSec * 12);
        }
      } else {
        vis.drainBeam.visible = false;
      }

      if (s.state === 'stunned') {
        vis.bodyMat.color.setHex(PALETTE.shadeStun);
        vis.bodyMat.emissive.set('#4c3c18');
        vis.eyeMat.color.setHex(PALETTE.moteGold);
        vis.stunStarsGroup.visible = true;
        vis.stunStarsGroup.rotation.y = elapsedSec * 5;
      } else if (s.state === 'recoil') {
        vis.bodyMat.color.setHex(PALETTE.shadeBody);
        vis.bodyMat.emissive.set(colorblind ? '#003a5c' : '#4c1d7a');
        vis.eyeMat.color.setHex(PALETTE.drifterSteel);
        vis.stunStarsGroup.visible = false;
      } else {
        vis.bodyMat.color.setHex(PALETTE.shadeBody);
        vis.bodyMat.emissive.set(s.state === 'drain' ? (colorblind ? '#0074b8' : '#581c99') : activeEmissiveHex);
        vis.eyeMat.color.setHex(activeEyeHex);
        vis.stunStarsGroup.visible = false;
      }
    }
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.disposeObjectResources(vis.group);
        this.scene.remove(vis.drainBeam);
        this.disposeObjectResources(vis.drainBeam);
        this.shadeVisuals.delete(id);
      }
    }

    // 7. Sync Gió Lạc (Drifters) with interpolated positions
    const activeDrifterIds = new Set<string>();
    for (const d of state.drifters) {
      activeDrifterIds.add(d.id);
      const vis = this.drifterVisuals.get(d.id) ?? this.createDrifterVisual(d.id);
      const prevD = prevDrifterPositions.get(d.id) ?? d.pos;
      const rPos = interpolatePos(prevD, d.pos, alpha);
      const swayY = d.pos[1] + 0.85 + Math.sin(elapsedSec * 5.2 + d.pos[2]) * 0.18;
      vis.group.position.set(rPos[0], swayY, rPos[2]);
      const speedYaw = Math.atan2(d.pos[0] - prevD[0], d.pos[2] - prevD[2]);
      if (Math.hypot(d.pos[0] - prevD[0], d.pos[2] - prevD[2]) > 1e-4) {
        vis.group.rotation.y = unwrapAngleRad(vis.group.rotation.y, speedYaw, 0.25);
      }

      vis.trailSegments.forEach((seg, idx) => {
        seg.position.x = Math.sin(elapsedSec * 7 + idx * 0.8) * (0.14 + idx * 0.04);
        seg.position.y = 0.25 + Math.cos(elapsedSec * 5 + idx * 0.7) * 0.08;
      });
      vis.stolenOrbs.forEach((orb, idx) => {
        orb.visible = idx < d.stolen;
        if (orb.visible) {
          const oa = elapsedSec * 4 + (idx / 3) * Math.PI * 2;
          orb.position.set(Math.cos(oa) * 0.55, 0.55, -0.5 + Math.sin(oa) * 0.45);
        }
      });
    }
    for (const [id, vis] of this.drifterVisuals.entries()) {
      if (!activeDrifterIds.has(id)) {
        this.scene.remove(vis.group);
        this.disposeObjectResources(vis.group);
        this.drifterVisuals.delete(id);
      }
    }

    // 8. Night 3 Strong Wind VFX + Bell Sway
    if (state.wind.enabled && (state.wind.active || state.wind.warning) && simDt > 0) {
      this.windParticleCooldown -= simDt;
      if (this.windParticleCooldown <= 0) {
        this.windParticleCooldown = state.wind.active ? 0.06 : 0.14;
        const wx = renderPlayerPos[0] + (Math.sin(elapsedSec * 19.3) * 14);
        const wz = renderPlayerPos[2] + (Math.cos(elapsedSec * 13.7) * 14);
        const wy = renderPlayerPos[1] + 0.8 + Math.abs(Math.sin(elapsedSec * 7)) * 2.4;
        this.vfx.spawnWindStreak([wx, wy, wz], state.wind.dirDeg, state.wind.warning && !state.wind.active);
      }
    }
    if (this.bellPivot) {
      this.bellPivot.rotation.z = state.wind.active
        ? Math.sin(elapsedSec * 8.5) * 0.28
        : Math.sin(elapsedSec * 1.4) * 0.04;
    }

    // 9. Event-driven VFX & particles
    for (const ev of events) {
      if (ev.name === 'mote_picked') {
        this.vfx.spawnBurst(renderPlayerPos, PALETTE.moteGold, 10, 3.2, 3.4, 1.0);
      } else if (ev.name === 'charm_picked') {
        this.vfx.spawnBurst(renderPlayerPos, PALETTE.goldUi, 16, 4.4, 4.2, 1.3);
        this.vfx.spawnWave(renderPlayerPos, PALETTE.mayScarf, 3.2, 0.5);
      } else if (ev.name === 'dash') {
        this.vfx.spawnDashTrail(renderPlayerPos, p.facing);
      } else if (ev.name === 'deposit' || ev.name === 'refuel') {
        const target = state.lanterns.find((l) => l.id === ev.data.lantern_id);
        if (target) this.vfx.spawnDepositStream(renderPlayerPos, target.pos);
      } else if (ev.name === 'lantern_lit') {
        const target = state.lanterns.find((l) => l.id === ev.data.lantern_id);
        if (target) this.vfx.spawnLanternCelebration(target.pos);
      } else if (ev.name === 'lantern_out') {
        const target = state.lanterns.find((l) => l.id === ev.data.lantern_id);
        if (target) {
          this.vfx.spawnBurst(
            [target.pos[0], target.pos[1] + 2.5, target.pos[2]],
            PALETTE.lanternUnlit,
            18,
            3.8,
            2.2,
            1.25
          );
        }
      } else if (ev.name === 'fuel_drain') {
        const target = state.lanterns.find((l) => l.id === ev.data.lantern_id);
        if (target) {
          this.vfx.spawnBurst(
            [target.pos[0], target.pos[1] + 2.9, target.pos[2]],
            colorblind ? PALETTE.shadeEyeCb : PALETTE.shadeEye,
            10,
            2.6,
            1.4,
            0.9
          );
        }
      } else if (ev.name === 'pulse') {
        this.vfx.spawnPulseEffect(renderPlayerPos);
      } else if (ev.name === 'drifter_steal') {
        this.vfx.spawnBurst(renderPlayerPos, PALETTE.drifterSteel, 12, 4.0, 2.5, 1.1);
      } else if (ev.name === 'drifter_drop') {
        const drifter = state.drifters.find((d) => d.id === ev.data.drifter_id);
        const pos = drifter ? drifter.pos : renderPlayerPos;
        this.vfx.spawnBurst(pos, PALETTE.moteGold, 14, 4.5, 3.5, 1.2);
      } else if (ev.name === 'player_hit') {
        this.vfx.spawnBurst(
          renderPlayerPos,
          ev.data.by === 'fall'
            ? PALETTE.drifterSteel
            : colorblind
              ? PALETTE.shadeEyeCb
              : PALETTE.shadeEye,
          16,
          4.5,
          2.5,
          1.15
        );
      }
    }
    this.vfx.update(simDt);

    // 10. Drift clouds & trees gently
    this.cloudClusters.forEach(({ group, baseY }, idx) => {
      group.position.y = baseY + Math.sin(elapsedSec * 0.45 + idx) * 0.35;
    });
    this.treeCrowns.forEach((crown, idx) => {
      crown.rotation.z = Math.sin(elapsedSec * 1.3 + idx) * 0.03;
    });

    return renderPlayerPos;
  }

  private disposeObjectResources(root: THREE.Object3D): void {
    root.traverse((obj) => {
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

  dispose(): void {
    this.vfx.dispose();
    for (const tex of this.disposableTextures) {
      tex.dispose();
    }
    this.moteCoreGeo.dispose();
    this.moteRandomMat.dispose();
    this.moteDroppedMat.dispose();
    this.disposeObjectResources(this.scene);
  }
}
