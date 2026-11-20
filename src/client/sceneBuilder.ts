import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FUEL_MAX_TICKS, LOW_FUEL_TICKS, TUNING } from '../sim/constants';
import { getMapConfig } from '../sim/maps';
import type { NightId, SimEvent, SimState, Vec3 } from '../sim/types';
import { computeAmbientIntensity, PALETTE } from './palette';
import { VfxManager } from './particles';
import { interpolatePos, unwrapAngleRad } from './renderMath';
import { createBambooBridgeTexture, createGlowTexture, createIslandGroundTexture } from './textures';

function colorizeGeo(geo: THREE.BufferGeometry, hex: string | number): THREE.BufferGeometry {
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  if (geo.index) geo.dispose();
  if (nonIdx.hasAttribute('uv')) nonIdx.deleteAttribute('uv');
  const pos = nonIdx.getAttribute('position');
  const col = new THREE.Color(hex);
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  nonIdx.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return nonIdx;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('Failed to merge Three.js geometries');
  return merged;
}

const MAX_INST_MOTES = 256;
const MAX_INST_SHADES = 256;
const MAX_INST_DRAIN_BEAMS = 64;
const MAX_INST_LANTERNS = 12;

interface DrifterVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshLambertMaterial;
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

  private readonly moteCoreInst: THREE.InstancedMesh;
  private readonly moteHaloInst: THREE.InstancedMesh;
  private readonly shadeBodyInst: THREE.InstancedMesh;
  private readonly shadeEyeInst: THREE.InstancedMesh;
  private readonly shadeWispInst: THREE.InstancedMesh;
  private readonly shadeStunStarInst: THREE.InstancedMesh;
  private readonly shadeDrainBeamInst: THREE.InstancedMesh;

  private readonly tmpDummy = new THREE.Object3D();
  private readonly tmpLocal = new THREE.Object3D();
  private readonly tmpParentMat = new THREE.Matrix4();
  private readonly tmpChildMat = new THREE.Matrix4();
  private readonly tmpColor = new THREE.Color();

  private readonly mayGroup = new THREE.Group();
  private readonly mayVisualPivot = new THREE.Group();
  private readonly mayLeftFoot = new THREE.Mesh();
  private readonly mayRightFoot = new THREE.Mesh();
  private readonly mayLeftArm = new THREE.Mesh();
  private readonly mayRightArm = new THREE.Mesh();
  private readonly mayLanternPivot = new THREE.Group();
  private readonly mayLanternLight: THREE.PointLight;
  private readonly mayBodyMat: THREE.MeshLambertMaterial;
  private readonly mayScarfTail = new THREE.Mesh();
  private readonly mayCharmAuraMat: THREE.MeshBasicMaterial;
  private readonly mayCharmAura: THREE.Mesh;

  private cloudInst: THREE.InstancedMesh | null = null;
  private readonly cloudItems: { x: number; baseY: number; z: number; sx: number; sy: number; sz: number; clusterIdx: number }[] = [];
  private readonly treeCrownInsts: { inst: THREE.InstancedMesh; items: { x: number; y: number; z: number; idx: number }[] }[] = [];
  private readonly jumpPadVisuals: JumpPadVisual[] = [];
  private bellPivot: THREE.Group | null = null;

  private readonly lanternPedestalInst: THREE.InstancedMesh;
  private readonly lanternRoofInst: THREE.InstancedMesh;
  private readonly lanternCoreInst: THREE.InstancedMesh;
  private readonly lanternTearInst: THREE.InstancedMesh;
  private readonly lanternCrystalInst: THREE.InstancedMesh;
  private readonly lanternFlameInst: THREE.InstancedMesh;
  private readonly lanternHaloInst: THREE.InstancedMesh;
  private readonly lanternSafeRingInst: THREE.InstancedMesh;
  private readonly lanternInnerRingInst: THREE.InstancedMesh;
  private readonly lanternFuelBgInst: THREE.InstancedMesh;
  private readonly lanternFuelFillInst: THREE.InstancedMesh;
  private readonly lanternOrbitMoteInst: THREE.InstancedMesh;
  private readonly lanternLights = new Map<string, THREE.PointLight>();
  private readonly drifterVisuals = new Map<string, DrifterVisual>();
  private readonly charmVisuals = new Map<string, CharmVisual>();

  private moveBlend = 0;
  private walkPhase = 0;
  private dustCooldown = 0;
  private dashTrailCooldown = 0;
  private windParticleCooldown = 0;
  private staticLanternsReady = false;
  private lastEnvAnimSec = -1;

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

    const whiteColor = new THREE.Color(0xffffff);
    const makeInst = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, withColor: boolean) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.count = 0;
      m.frustumCulled = false;
      if (withColor) m.setColorAt(0, whiteColor);
      this.scene.add(m);
      return m;
    };

    this.moteCoreInst = makeInst(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_INST_MOTES,
      true
    );
    this.moteHaloInst = makeInst(
      new THREE.PlaneGeometry(1.12, 1.12),
      new THREE.MeshBasicMaterial({
        map: this.warmGlowTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
      MAX_INST_MOTES,
      true
    );

    const phantomProfile = [
      new THREE.Vector2(0.0, -0.78),
      new THREE.Vector2(0.36, -0.25),
      new THREE.Vector2(0.52, 0.22),
      new THREE.Vector2(0.0, 0.72)
    ];
    const bodyLathe = new THREE.LatheGeometry(phantomProfile, 6);
    const hornL = new THREE.ConeGeometry(0.14, 0.42, 4);
    hornL.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(-0.22, 0.65, -0.05),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0.35)),
        new THREE.Vector3(1, 1, 1)
      )
    );
    const hornR = new THREE.ConeGeometry(0.14, 0.42, 4);
    hornR.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(0.22, 0.65, -0.05),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, -0.35)),
        new THREE.Vector3(1, 1, 1)
      )
    );
    this.shadeBodyInst = makeInst(
      mergeParts([bodyLathe, hornL, hornR]),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_INST_SHADES,
      true
    );

    const eyeL = new THREE.OctahedronGeometry(0.075, 0);
    eyeL.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(-0.18, 0.22, 0.46),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.22)),
        new THREE.Vector3(1.25, 0.75, 0.65)
      )
    );
    const eyeR = new THREE.OctahedronGeometry(0.075, 0);
    eyeR.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(0.18, 0.22, 0.46),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.22)),
        new THREE.Vector3(1.25, 0.75, 0.65)
      )
    );
    this.shadeEyeInst = makeInst(
      mergeParts([eyeL, eyeR]),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_INST_SHADES,
      true
    );

    const wispParts: THREE.BufferGeometry[] = [];
    for (let w = 0; w < 3; w++) {
      const wa = (w / 3) * Math.PI * 2;
      const wg = new THREE.ConeGeometry(0.09, 0.36, 3);
      wg.rotateX(Math.PI);
      wg.translate(Math.cos(wa) * 0.4, -0.52 + (w === 1 ? 0.06 : 0), Math.sin(wa) * 0.4);
      wispParts.push(wg);
    }
    this.shadeWispInst = makeInst(
      mergeParts(wispParts),
      new THREE.MeshBasicMaterial({ color: 0x261248 }),
      MAX_INST_SHADES,
      false
    );
    this.shadeStunStarInst = makeInst(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteGold }),
      MAX_INST_SHADES * 3,
      false
    );
    const beamGeo = new THREE.CylinderGeometry(0.055, 0.13, 1, 6);
    beamGeo.rotateX(Math.PI / 2);
    this.shadeDrainBeamInst = makeInst(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.68 }),
      MAX_INST_DRAIN_BEAMS,
      true
    );

    // Instanced Lantern batches (11 draw calls total for all 5-7 lanterns & VFX)
    const stepG = colorizeGeo(new THREE.CylinderGeometry(1.05, 1.25, 0.32, 8).translate(0, 0.16, 0), PALETTE.lanternUnlit);
    const baseG = colorizeGeo(new THREE.CylinderGeometry(0.74, 0.92, 0.4, 8).translate(0, 0.52, 0), PALETTE.lanternUnlit);
    const pillarG = colorizeGeo(new THREE.CylinderGeometry(0.23, 0.3, 2.0, 8).translate(0, 1.72, 0), PALETTE.lanternUnlit);
    const collarG = colorizeGeo(new THREE.BoxGeometry(0.95, 0.18, 0.95).translate(0, 2.75, 0), PALETTE.wood);
    this.lanternPedestalInst = makeInst(
      mergeParts([stepG, baseG, pillarG, collarG]),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      MAX_INST_LANTERNS,
      false
    );

    const roof1G = colorizeGeo(new THREE.ConeGeometry(1.12, 0.45, 8).translate(0, 0.98, 0), PALETTE.wood);
    const roof2G = colorizeGeo(new THREE.ConeGeometry(0.75, 0.42, 8).translate(0, 1.32, 0), PALETTE.lanternUnlit);
    const spireG = colorizeGeo(new THREE.ConeGeometry(0.1, 0.45, 6).translate(0, 1.71, 0), PALETTE.goldUi);
    this.lanternRoofInst = makeInst(
      mergeParts([roof1G, roof2G, spireG]),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      MAX_INST_LANTERNS,
      false
    );

    this.lanternCoreInst = makeInst(
      new THREE.OctahedronGeometry(0.54, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_INST_LANTERNS,
      true
    );

    const slashParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const a = ((i + 0.5) / 4) * Math.PI * 2;
      const slashA = new THREE.BoxGeometry(0.56, 0.075, 0.06);
      slashA.rotateZ(0.44);
      slashA.rotateY(-a + Math.PI / 2);
      slashA.translate(Math.cos(a) * 0.41, 0.06, Math.sin(a) * 0.41);
      const slashB = new THREE.BoxGeometry(0.56, 0.075, 0.06);
      slashB.rotateZ(-0.38);
      slashB.rotateY(-a + Math.PI / 2);
      slashB.translate(Math.cos(a) * 0.41, -0.09, Math.sin(a) * 0.41);
      slashParts.push(slashA, slashB);
    }
    this.lanternTearInst = makeInst(
      mergeParts(slashParts),
      new THREE.MeshBasicMaterial({ color: '#0f1320' }),
      MAX_INST_LANTERNS,
      false
    );

    const crystalParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      crystalParts.push(new THREE.ConeGeometry(0.16, 0.52, 5).translate(Math.cos(a) * 1.48, 0.25, Math.sin(a) * 1.48));
    }
    this.lanternCrystalInst = makeInst(
      mergeParts(crystalParts),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_INST_LANTERNS,
      true
    );

    this.lanternFlameInst = makeInst(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore }),
      MAX_INST_LANTERNS,
      false
    );
    this.lanternHaloInst = makeInst(
      new THREE.PlaneGeometry(3.1, 3.1),
      new THREE.MeshBasicMaterial({
        map: this.warmGlowTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
      MAX_INST_LANTERNS,
      true
    );

    const safeRingGeo = new THREE.RingGeometry(TUNING.safe_radius - 0.16, TUNING.safe_radius, 36);
    safeRingGeo.rotateX(-Math.PI / 2);
    this.lanternSafeRingInst = makeInst(
      safeRingGeo,
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternWarm, transparent: true, opacity: 0.46, side: THREE.DoubleSide }),
      MAX_INST_LANTERNS,
      false
    );
    const innerRingGeo = new THREE.RingGeometry(TUNING.safe_radius - 0.7, TUNING.safe_radius - 0.56, 16);
    innerRingGeo.rotateX(-Math.PI / 2);
    this.lanternInnerRingInst = makeInst(
      innerRingGeo,
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
      MAX_INST_LANTERNS,
      false
    );
    this.lanternFuelBgInst = makeInst(
      new THREE.PlaneGeometry(1.56, 0.22),
      new THREE.MeshBasicMaterial({ color: '#0e1430', side: THREE.DoubleSide }),
      MAX_INST_LANTERNS,
      false
    );
    this.lanternFuelFillInst = makeInst(
      new THREE.BoxGeometry(1.44, 0.13, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_INST_LANTERNS,
      true
    );
    this.lanternOrbitMoteInst = makeInst(
      new THREE.SphereGeometry(0.11, 6, 5),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteGold }),
      MAX_INST_LANTERNS * TUNING.lantern_cost,
      false
    );

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
      const light = new THREE.PointLight(PALETTE.lanternWarm, 0, 22, 1.45);
      light.position.set(l.pos[0], l.pos[1] + 3.3, l.pos[2]);
      light.visible = false;
      this.scene.add(light);
      this.lanternLights.set(l.id, light);
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
    const waterGeo = new THREE.CircleGeometry(145, 28);
    const waterMat = new THREE.MeshBasicMaterial({
      color: '#0d1633'
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(night === 2 ? 35 : 0, -10.5, 0);
    water.renderOrder = 5;
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

    const baseGeo = colorizeGeo(
      new THREE.CylinderGeometry(radius, radius * 0.95, 2.2, 36).translate(centerX, -1.1, 0),
      '#20263a'
    );
    const skirtGeo = colorizeGeo(
      new THREE.ConeGeometry(radius * 0.94, 9.5, 24, 1, true).rotateX(Math.PI).translate(centerX, -6.9, 0),
      '#1b2038'
    );
    this.scene.add(
      new THREE.Mesh(mergeParts([baseGeo, skirtGeo]), new THREE.MeshBasicMaterial({ vertexColors: true }))
    );

    const surfaceGeo = new THREE.RingGeometry(0.001, radius, 40, 12);
    const surfaceMat = new THREE.MeshLambertMaterial({
      map: tex
    });
    const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfaceMesh.rotation.x = -Math.PI / 2;
    surfaceMesh.position.set(centerX, 0.008, 0);
    this.scene.add(surfaceMesh);

    const rimGeo = new THREE.RingGeometry(radius - 0.45, radius, 48);
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
      new THREE.CylinderGeometry(radius, radius + 0.3, 0.08, 28),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand })
    );
    plaza.position.set(x, y + 0.02, z);
    this.scene.add(plaza);
  }

  private buildPier(x: number, zStart: number): void {
    const woodMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood });
    const woodParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const plank = new THREE.BoxGeometry(3.4, 0.14, 0.55);
      plank.translate(x, 0.05, zStart + i * 0.72);
      woodParts.push(plank);
    }
    const orbParts: THREE.BufferGeometry[] = [];
    for (const sx of [-1.45, 1.45]) {
      const post = new THREE.CylinderGeometry(0.14, 0.17, 1.5, 8);
      post.translate(x + sx, 0.5, zStart + 3.6);
      woodParts.push(post);
      const miniOrb = new THREE.SphereGeometry(0.16, 8, 6);
      miniOrb.translate(x + sx, 1.3, zStart + 3.6);
      orbParts.push(miniOrb);
    }
    this.scene.add(
      new THREE.Mesh(mergeParts(woodParts), woodMat),
      new THREE.Mesh(mergeParts(orbParts), new THREE.MeshBasicMaterial({ color: PALETTE.lanternWarm }))
    );
  }

  private buildBambooBridge(): void {
    const bridgeTex = createBambooBridgeTexture();
    this.disposableTextures.push(bridgeTex);

    const group = new THREE.Group();
    // Deck spans x ∈ [26..44], z ∈ [-2..2], top flush at Y = 0
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(18.2, 0.28, 4.0),
      new THREE.MeshLambertMaterial({ map: bridgeTex })
    );
    deck.position.set(35, -0.14, 0);
    group.add(deck);

    const railMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood });
    const railParts: THREE.BufferGeometry[] = [];
    const lampParts: THREE.BufferGeometry[] = [];
    for (let px = 27; px <= 43; px += 4) {
      for (const pz of [-1.85, 1.85]) {
        const post = new THREE.CylinderGeometry(0.09, 0.11, 1.15, 8);
        post.translate(px, 0.55, pz);
        railParts.push(post);

        const pylon = new THREE.CylinderGeometry(0.16, 0.2, 10.5, 8);
        pylon.translate(px, -5.25, pz);
        railParts.push(pylon);

        if (px === 31 || px === 35 || px === 39) {
          const ferryLamp = new THREE.SphereGeometry(0.13, 8, 6);
          ferryLamp.translate(px, 1.22, pz);
          lampParts.push(ferryLamp);
        }
      }
    }
    for (const pz of [-1.85, 1.85]) {
      const railBar = new THREE.BoxGeometry(18.0, 0.09, 0.09);
      railBar.translate(35, 0.92, pz);
      railParts.push(railBar);
    }
    group.add(
      new THREE.Mesh(mergeParts(railParts), railMat),
      new THREE.Mesh(mergeParts(lampParts), new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore }))
    );

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
    const topMat = new THREE.MeshPhongMaterial({ color: PALETTE.grass, shininess: 6, specular: '#181e2c' });
    const wallMat = new THREE.MeshLambertMaterial({ color: '#31374f' });
    const tier1 = new THREE.Mesh(extrudeGeo, [topMat, wallMat]);
    // Rotate +90° around X: local +y -> +Z (z >= 0!), extrude +z [0..3] -> world Y = 3 - z [3..0]
    tier1.rotation.x = Math.PI / 2;
    tier1.position.y = 3.0;
    this.scene.add(tier1);

    // Warm sandy stone trim on Tier 1 rim
    const trimGeo = new THREE.RingGeometry(23.3, 24.05, 42, 1, Math.PI, Math.PI);
    const trimMat = new THREE.MeshLambertMaterial({ color: PALETTE.sand });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.rotation.x = -Math.PI / 2;
    trim.position.y = 3.015;
    this.scene.add(trim);
  }

  private buildNight3Tier2Sanctuary(): void {
    // Tier 2 solid plateau: R = 8m, Y = 0..6.0
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(8.0, 8.2, 6.0, 40),
      new THREE.MeshLambertMaterial({ color: '#323850' })
    );
    wall.position.y = 3.0;
    this.scene.add(wall);

    const cap = new THREE.Mesh(
      new THREE.CircleGeometry(7.98, 40),
      new THREE.MeshPhongMaterial({ color: PALETTE.grass, shininess: 6, specular: '#181e2c' })
    );
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = 6.01;
    this.scene.add(cap);

    const outerRim = new THREE.Mesh(
      new THREE.RingGeometry(7.35, 8.0, 40),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand, side: THREE.DoubleSide })
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

    const plankMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood });
    const plankParts: THREE.BufferGeometry[] = [];
    const deck = new THREE.BoxGeometry(rampLen + 0.2, 0.24, 3.0);
    deck.translate(0, -0.12, 0);
    plankParts.push(deck);
    for (const sz of [-1.42, 1.42]) {
      const rail = new THREE.BoxGeometry(rampLen + 0.1, 0.08, 0.08);
      rail.translate(0, 0.72, sz);
      plankParts.push(rail);
    }
    tilted.add(new THREE.Mesh(mergeParts(plankParts), plankMat));

    const slatMat = new THREE.MeshLambertMaterial({ color: PALETTE.sand });
    const slatParts: THREE.BufferGeometry[] = [];
    for (let i = -3; i <= 3; i++) {
      const slat = new THREE.BoxGeometry(0.18, 0.04, 2.75);
      slat.translate((i / 3.5) * (rampLen * 0.45), 0.02, 0);
      slatParts.push(slat);
    }
    tilted.add(new THREE.Mesh(mergeParts(slatParts), slatMat));
    group.add(tilted);

    const pillarParts: THREE.BufferGeometry[] = [];
    for (const sz of [-1.3, 1.3]) {
      const pillar = new THREE.CylinderGeometry(0.14, 0.18, 2.2, 8);
      pillar.translate(0, -0.5, sz);
      pillarParts.push(pillar);
    }
    group.add(new THREE.Mesh(mergeParts(pillarParts), plankMat));
    this.scene.add(group);
  }

  private buildBellTower(): void {
    // Solid collider is cylinder R = 2.0m at (0, 6..14, 0)
    const group = new THREE.Group();
    group.position.set(0, 6.0, 0);

    const stoneMat = new THREE.MeshLambertMaterial({ color: '#4c4e66' });
    const woodMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood });
    const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.mayScarf });
    const goldMat = new THREE.MeshLambertMaterial({ color: PALETTE.goldUi, emissive: '#593b00' });

    const plinth = new THREE.CylinderGeometry(1.98, 2.05, 1.2, 8);
    plinth.translate(0, 0.6, 0);
    const lowerBody = new THREE.CylinderGeometry(1.68, 1.85, 2.0, 8);
    lowerBody.translate(0, 2.2, 0);
    group.add(new THREE.Mesh(mergeParts([plinth, lowerBody]), stoneMat));

    const woodParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const col = new THREE.CylinderGeometry(0.16, 0.18, 2.8, 8);
      col.translate(Math.cos(a) * 1.25, 4.5, Math.sin(a) * 1.25);
      woodParts.push(col);
    }
    const eaves2 = new THREE.ConeGeometry(1.55, 1.15, 8);
    eaves2.translate(0, 7.15, 0);
    woodParts.push(eaves2);
    group.add(new THREE.Mesh(mergeParts(woodParts), woodMat));

    const bellPivot = new THREE.Group();
    bellPivot.position.y = 5.4;
    const bellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 1.05, 12), goldMat);
    bellBody.position.y = -0.65;
    bellPivot.add(bellBody);
    group.add(bellPivot);
    this.bellPivot = bellPivot;

    const eaves1 = new THREE.Mesh(new THREE.ConeGeometry(2.35, 1.15, 8), roofMat);
    eaves1.position.y = 6.2;
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), goldMat);
    finial.position.y = 7.9;
    group.add(eaves1, finial);

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
    const stoneMat = new THREE.MeshLambertMaterial({
      color: '#43485c',
      flatShading: true
    });
    const inst = new THREE.InstancedMesh(stoneGeo, stoneMat, count);
    let idx = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.14;
      if (skipPierSouth && Math.abs(a - Math.PI / 2) < 0.2) continue;
      const x = cx + Math.cos(a) * (radius - 0.9);
      const z = cz + Math.sin(a) * (radius - 0.9);
      if (bridgeGapXRange && x > 24 && x < 46 && Math.abs(z) < 3.4) continue;

      this.tmpDummy.position.set(x, 0.18, z);
      this.tmpDummy.rotation.set(0, a * 2, 0);
      this.tmpDummy.scale.set(1.2, 0.65 + (i % 3) * 0.18, 1.0);
      this.tmpDummy.updateMatrix();
      inst.setMatrixAt(idx++, this.tmpDummy.matrix);
    }
    inst.count = idx;
    inst.instanceMatrix.needsUpdate = true;
    this.scene.add(inst);
  }

  private buildPineTreesRing(cx: number, cz: number, distBase: number, count: number): void {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1.8, 7);
    const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood });
    const leafMat = new THREE.MeshLambertMaterial({
      color: '#22473d',
      emissive: '#0c1f1a',
      flatShading: true
    });
    const tier1 = new THREE.ConeGeometry(1.45, 2.0, 7);
    tier1.translate(0, 0.6, 0);
    const tier2 = new THREE.ConeGeometry(1.05, 1.7, 7);
    tier2.translate(0, 1.65, 0);
    const tier3 = new THREE.ConeGeometry(0.65, 1.3, 7);
    tier3.translate(0, 2.5, 0);
    const crownGeo = mergeParts([tier1, tier2, tier3]);

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crownInst = new THREE.InstancedMesh(crownGeo, leafMat, count);
    const items: { x: number; y: number; z: number; idx: number }[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.31;
      const dist = distBase + (i % 2) * 2.5;
      const tx = cx + Math.cos(angle) * dist;
      const tz = cz + Math.sin(angle) * dist;
      this.tmpDummy.position.set(tx, 0.9, tz);
      this.tmpDummy.rotation.set(0, 0, 0);
      this.tmpDummy.scale.set(1, 1, 1);
      this.tmpDummy.updateMatrix();
      trunkInst.setMatrixAt(i, this.tmpDummy.matrix);

      this.tmpDummy.position.set(tx, 1.9, tz);
      this.tmpDummy.updateMatrix();
      crownInst.setMatrixAt(i, this.tmpDummy.matrix);
      items.push({ x: tx, y: 1.9, z: tz, idx: i });
    }
    trunkInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceMatrix.needsUpdate = true;
    this.scene.add(trunkInst, crownInst);
    this.treeCrownInsts.push({ inst: crownInst, items });
  }

  private buildArecaPalms(cx: number, cz: number, dist: number, count: number): void {
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#7d694e' });
    const frondMat = new THREE.MeshLambertMaterial({
      color: PALETTE.grass,
      emissive: '#10261f',
      flatShading: true
    });
    const frondParts: THREE.BufferGeometry[] = [];
    for (let f = 0; f < 6; f++) {
      const fa = (f / 6) * Math.PI * 2;
      const frond = new THREE.ConeGeometry(0.32, 1.95, 4);
      frond.rotateZ(-Math.PI * 0.34);
      frond.translate(0.75, 0.15, 0);
      frond.rotateY(fa);
      frondParts.push(frond);
    }
    const crownGeo = mergeParts(frondParts);
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1.0, 8);
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crownInst = new THREE.InstancedMesh(crownGeo, frondMat, count);
    const items: { x: number; y: number; z: number; idx: number }[] = [];
    let valid = 0;

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.45;
      const px = cx + Math.cos(a) * dist;
      const pz = cz + Math.sin(a) * dist;
      if (px > 23 && px < 47 && Math.abs(pz) < 4) continue;

      const h = 4.2 + (i % 3) * 0.55;
      this.tmpDummy.position.set(px, h / 2, pz);
      this.tmpDummy.rotation.set(0, 0, ((i % 2) * 2 - 1) * 0.04);
      this.tmpDummy.scale.set(1, h, 1);
      this.tmpDummy.updateMatrix();
      trunkInst.setMatrixAt(valid, this.tmpDummy.matrix);

      this.tmpDummy.position.set(px, h, pz);
      this.tmpDummy.rotation.set(0, 0, 0);
      this.tmpDummy.scale.set(1, 1, 1);
      this.tmpDummy.updateMatrix();
      crownInst.setMatrixAt(valid, this.tmpDummy.matrix);
      items.push({ x: px, y: h, z: pz, idx: valid });
      valid++;
    }
    trunkInst.count = valid;
    crownInst.count = valid;
    trunkInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceMatrix.needsUpdate = true;
    this.scene.add(trunkInst, crownInst);
    this.treeCrownInsts.push({ inst: crownInst, items });
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

    const cloudMat = new THREE.MeshBasicMaterial({
      color: '#1b264a'
    });
    const puffGeo = new THREE.IcosahedronGeometry(4.4, 0);
    const centerX = this.night === 2 ? 35 : 0;
    const totalPuffs = 20 * 2;
    const cloudInst = new THREE.InstancedMesh(puffGeo, cloudMat, totalPuffs);
    cloudInst.frustumCulled = false;
    let puffIdx = 0;
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const dist = 36 + (i % 4) * 18;
      const clusterY = -6.2 - (i % 3) * 1.3;
      const cx = centerX + Math.cos(angle) * dist;
      const cz = Math.sin(angle) * dist;
      for (let j = 0; j < 2; j++) {
        const x = cx + (j - 0.5) * 4.4;
        const baseY = clusterY + (j % 2) * 0.6;
        const z = cz + ((j + i) % 2) * 2.1;
        this.cloudItems.push({ x, baseY, z, sx: 1.6, sy: 0.44, sz: 1.35, clusterIdx: i });
        this.tmpDummy.position.set(x, baseY, z);
        this.tmpDummy.rotation.set(0, 0, 0);
        this.tmpDummy.scale.set(1.6, 0.44, 1.35);
        this.tmpDummy.updateMatrix();
        cloudInst.setMatrixAt(puffIdx++, this.tmpDummy.matrix);
      }
    }
    cloudInst.instanceMatrix.needsUpdate = true;
    this.cloudInst = cloudInst;
    this.scene.add(cloudInst);
  }

  private buildMayCharacter(): {
    bodyMat: THREE.MeshLambertMaterial;
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
    const footMat = new THREE.MeshLambertMaterial({ color: '#2b2438' });
    this.mayLeftFoot.position.set(-0.14, 0.13, 0);
    this.mayRightFoot.position.set(0.14, 0.13, 0);
    this.mayVisualPivot.add(this.mayLeftFoot, this.mayRightFoot);

    // Official cloak palette: #E8E2D0 ivory-white cloak with #C8102E scarlet scarf & trim (merged 1 draw call)
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const skirtProfile = [
      new THREE.Vector2(0.41, 0.18),
      new THREE.Vector2(0.35, 0.42),
      new THREE.Vector2(0.21, 0.70),
      new THREE.Vector2(0.0, 0.70)
    ];
    const staticParts: THREE.BufferGeometry[] = [
      colorizeGeo(new THREE.LatheGeometry(skirtProfile, 16), PALETTE.mayCloak),
      colorizeGeo(new THREE.CylinderGeometry(0.16, 0.215, 0.35, 16).translate(0, 0.875, 0), PALETTE.mayCloak),
      colorizeGeo(new THREE.TorusGeometry(0.21, 0.032, 8, 16).rotateX(Math.PI / 2).translate(0, 0.705, 0), PALETTE.mayScarf),
      colorizeGeo(new THREE.TorusGeometry(0.145, 0.04, 8, 16).rotateX(Math.PI / 2).translate(0, 1.06, 0), PALETTE.mayScarf),
      colorizeGeo(new THREE.SphereGeometry(0.22, 12, 10).translate(0, 1.24, 0), '#ffe3c7'),
      colorizeGeo(new THREE.SphereGeometry(0.225, 12, 10).translate(0, 1.26, -0.045), '#241b38'),
      colorizeGeo(new THREE.SphereGeometry(0.03, 6, 6).translate(-0.08, 1.24, 0.205), '#1b1426'),
      colorizeGeo(new THREE.SphereGeometry(0.03, 6, 6).translate(0.08, 1.24, 0.205), '#1b1426'),
      colorizeGeo(new THREE.ConeGeometry(0.66, 0.34, 18).translate(0, 1.49, 0), PALETTE.sand),
      colorizeGeo(new THREE.TorusGeometry(0.65, 0.026, 8, 18).rotateX(Math.PI / 2).translate(0, 1.32, 0), PALETTE.wood)
    ];
    this.mayVisualPivot.add(new THREE.Mesh(mergeParts(staticParts), bodyMat));

    const scarfMat = new THREE.MeshLambertMaterial({
      color: PALETTE.mayScarf,
      emissive: '#38040e'
    });
    this.mayScarfTail.geometry = new THREE.BoxGeometry(0.11, 0.03, 0.34);
    this.mayScarfTail.material = scarfMat;
    this.mayScarfTail.position.set(0.04, 1.02, -0.22);
    this.mayVisualPivot.add(this.mayScarfTail);

    const armGeo = new THREE.CapsuleGeometry(0.065, 0.2, 4, 6);
    const armMat = new THREE.MeshLambertMaterial({ color: PALETTE.mayCloak });
    this.mayLeftArm.position.set(-0.24, 0.88, 0.02);
    this.mayLeftArm.rotation.z = 0.28;
    this.mayRightArm.position.set(0.24, 0.88, 0.02);
    this.mayRightArm.rotation.z = -0.28;
    this.mayVisualPivot.add(this.mayLeftArm, this.mayRightArm);

    // Hanging mini-lantern under hat brim
    this.mayLanternPivot.position.set(-0.56, 1.32, 0.12);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.sand })
    );
    cord.position.y = -0.1;
    const capGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.05, 8);
    capGeo.translate(0, -0.21, 0);
    const bottomGeo = new THREE.CylinderGeometry(0.085, 0.05, 0.03, 8);
    bottomGeo.translate(0, -0.38, 0);
    const capMesh = new THREE.Mesh(
      mergeParts([capGeo, bottomGeo]),
      new THREE.MeshLambertMaterial({ color: PALETTE.wood })
    );
    const miniLantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.075, 0.14, 10),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
    );
    miniLantern.position.y = -0.30;

    const lanternHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: PALETTE.lanternWarm,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    lanternHalo.scale.set(0.88, 0.88, 1);
    lanternHalo.position.y = -0.30;

    const lanternLight = new THREE.PointLight(PALETTE.lanternWarm, 2.0, 15, 1.5);
    lanternLight.position.y = -0.30;
    this.mayLanternPivot.add(cord, capMesh, miniLantern, lanternHalo, lanternLight);
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

  private createJumpPadVisual(pos: Vec3): void {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.05, 0.14, 24),
      new THREE.MeshLambertMaterial({ color: PALETTE.wood })
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
      new THREE.MeshLambertMaterial({ color: PALETTE.lanternUnlit })
    );
    pedestal.position.y = 0.175;
    group.add(pedestal);

    const scrollGroup = new THREE.Group();
    scrollGroup.position.y = 1.05;
    const goldMat = new THREE.MeshLambertMaterial({
      color: PALETTE.goldUi,
      emissive: '#8f620a',
      emissiveIntensity: 0.7
    });
    const scrollTag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.65, 0.08), goldMat);
    const scarletRibbon = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.16, 0.11),
      new THREE.MeshLambertMaterial({ color: PALETTE.mayScarf })
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

  private createDrifterVisual(id: string): DrifterVisual {
    const group = new THREE.Group();
    // Steel-blue wind ribbon spirit (#8FA3B8)
    const bodyMat = new THREE.MeshLambertMaterial({
      color: PALETTE.drifterSteel,
      emissive: '#38516b',
      emissiveIntensity: 0.75
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
    this.mayLanternLight.intensity = 1.9 + Math.sin(elapsedSec * 8) * 0.16;
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

    // 2. Update Lanterns via GPU InstancedMesh batches & Official Ambient Intensity
    const camX = opts.cameraPos?.[0] ?? 0;
    const camY = opts.cameraPos?.[1] ?? 10;
    const camZ = opts.cameraPos?.[2] ?? 14;
    const blink1HzOn = Math.sin(elapsedSec * Math.PI * 2) >= 0;
    const lCount = Math.min(state.lanterns.length, MAX_INST_LANTERNS);
    let litCount = 0;
    let tearCount = 0;
    let flameCount = 0;
    let haloCount = 0;
    let ringCount = 0;
    let fuelBarCount = 0;
    let orbitCount = 0;

    for (let i = 0; i < lCount; i++) {
      const l = state.lanterns[i];
      if (l.lit) litCount += 1;
      const req = l.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
      const ratio = Math.min(1, l.deposited / Math.max(1, req));
      const [lx, ly, lz] = l.pos;

      // Pedestal
      this.tmpDummy.position.set(lx, ly, lz);
      this.tmpDummy.rotation.set(0, 0, 0);
      this.tmpDummy.scale.set(1, 1, 1);
      this.tmpDummy.updateMatrix();
      this.lanternPedestalInst.setMatrixAt(i, this.tmpDummy.matrix);

      // Roof (squashed 20% when unlit)
      this.tmpDummy.position.set(lx, ly + 2.84, lz);
      if (l.lit) this.tmpDummy.scale.set(1, 1, 1);
      else this.tmpDummy.scale.set(1.06, 0.8, 1.06);
      this.tmpDummy.updateMatrix();
      this.lanternRoofInst.setMatrixAt(i, this.tmpDummy.matrix);

      // Core octahedron
      this.tmpDummy.position.set(lx, ly + (l.lit ? 3.25 : 3.168), lz);
      if (l.lit) this.tmpDummy.scale.set(1, 1, 1);
      else this.tmpDummy.scale.set(1.06, 0.8, 1.06);
      this.tmpDummy.updateMatrix();
      this.lanternCoreInst.setMatrixAt(i, this.tmpDummy.matrix);

      const light = this.lanternLights.get(l.id);
      if (l.lit) {
        const fuelRatio = Math.max(0, Math.min(1, l.fuelTicks / FUEL_MAX_TICKS));
        const isLowFuel = l.fuelTicks < LOW_FUEL_TICKS;
        const pulseMult = isLowFuel ? (blink1HzOn ? 1.0 : 0.35) : 1.0;

        this.tmpColor.setHex(PALETTE.lanternCore).multiplyScalar(pulseMult);
        this.lanternCoreInst.setColorAt(i, this.tmpColor);
        this.tmpColor.setHex(PALETTE.lanternWarm).multiplyScalar(0.85 * pulseMult);
        this.lanternCrystalInst.setColorAt(i, this.tmpColor);

        if (!isLowFuel || blink1HzOn) {
          this.tmpDummy.position.set(lx, ly + 3.25, lz);
          this.tmpDummy.scale.setScalar(0.95 + Math.sin(elapsedSec * 8) * 0.1);
          this.tmpDummy.updateMatrix();
          this.lanternFlameInst.setMatrixAt(flameCount++, this.tmpDummy.matrix);

          const barYaw = Math.atan2(camX - lx, camZ - lz);
          const barY = ly + 5.05;
          this.tmpDummy.position.set(lx, barY, lz);
          this.tmpDummy.rotation.set(0, barYaw, 0);
          this.tmpDummy.scale.set(1, 1, 1);
          this.tmpDummy.updateMatrix();
          this.lanternFuelBgInst.setMatrixAt(fuelBarCount, this.tmpDummy.matrix);

          const fillSx = Math.max(0.02, fuelRatio);
          const fillOffset = -0.72 * (1 - fillSx);
          this.tmpDummy.position.set(lx + Math.cos(barYaw) * fillOffset, barY, lz - Math.sin(barYaw) * fillOffset);
          this.tmpDummy.scale.set(fillSx, 1, 1);
          this.tmpDummy.updateMatrix();
          this.lanternFuelFillInst.setMatrixAt(fuelBarCount, this.tmpDummy.matrix);
          this.tmpColor.setHex(isLowFuel ? (colorblind ? PALETTE.dangerCb : PALETTE.danger) : PALETTE.goldUi);
          this.lanternFuelFillInst.setColorAt(fuelBarCount++, this.tmpColor);
        }

        const haloBright = (0.85 + Math.sin(elapsedSec * 6) * 0.1) * pulseMult;
        this.tmpDummy.position.set(lx, ly + 3.25, lz);
        this.tmpDummy.scale.set(1, 1, 1);
        this.tmpDummy.lookAt(camX, camY, camZ);
        this.tmpDummy.updateMatrix();
        this.lanternHaloInst.setMatrixAt(haloCount, this.tmpDummy.matrix);
        this.tmpColor.setHex(PALETTE.lanternWarm).multiplyScalar(haloBright);
        this.lanternHaloInst.setColorAt(haloCount++, this.tmpColor);

        if (!isLowFuel) {
          this.tmpDummy.position.set(lx, ly + 0.05, lz);
          this.tmpDummy.rotation.set(0, 0, 0);
          this.tmpDummy.scale.set(1, 1, 1);
          this.tmpDummy.updateMatrix();
          this.lanternSafeRingInst.setMatrixAt(ringCount, this.tmpDummy.matrix);

          this.tmpDummy.position.set(lx, ly + 0.045, lz);
          this.tmpDummy.rotation.set(0, -elapsedSec * 0.35, 0);
          this.tmpDummy.updateMatrix();
          this.lanternInnerRingInst.setMatrixAt(ringCount++, this.tmpDummy.matrix);
        }

        if (light) {
          light.position.set(lx, ly + 3.3, lz);
          light.intensity = (4.6 + Math.sin(elapsedSec * 6) * 0.3) * pulseMult;
          light.visible = light.intensity > 0.01;
        }
      } else {
        this.tmpColor.setHex(ratio > 0 ? PALETTE.lanternWarm : 0x3b4156).multiplyScalar(ratio > 0 ? 0.45 + ratio * 0.5 : 1);
        this.lanternCoreInst.setColorAt(i, this.tmpColor);
        this.tmpColor.setHex(ratio > 0 ? PALETTE.lanternWarm : 0x2a2f42).multiplyScalar(ratio > 0 ? 0.35 + ratio * 0.45 : 1);
        this.lanternCrystalInst.setColorAt(i, this.tmpColor);

        this.tmpDummy.position.set(lx, ly + 3.168, lz);
        this.tmpDummy.rotation.set(0, 0, 0);
        this.tmpDummy.scale.set(1.06, 0.8, 1.06);
        this.tmpDummy.updateMatrix();
        this.lanternTearInst.setMatrixAt(tearCount++, this.tmpDummy.matrix);

        if (ratio > 0) {
          this.tmpDummy.position.set(lx, ly + 3.25, lz);
          this.tmpDummy.scale.set(0.85, 0.85, 1);
          this.tmpDummy.lookAt(camX, camY, camZ);
          this.tmpDummy.updateMatrix();
          this.lanternHaloInst.setMatrixAt(haloCount, this.tmpDummy.matrix);
          this.tmpColor.setHex(PALETTE.lanternWarm).multiplyScalar(ratio * 0.38);
          this.lanternHaloInst.setColorAt(haloCount++, this.tmpColor);
        }

        if (light) {
          light.position.set(lx, ly + 3.3, lz);
          light.intensity = ratio * 2.1;
          light.visible = light.intensity > 0.01;
        }

        const depMax = Math.min(TUNING.lantern_cost, l.deposited);
        for (let idx = 0; idx < depMax; idx++) {
          const a = elapsedSec * 2.4 + (idx / Math.max(1, l.deposited)) * Math.PI * 2;
          this.tmpDummy.position.set(
            lx + Math.cos(a) * 0.85,
            ly + 3.2 + Math.sin(elapsedSec * 4 + idx) * 0.12,
            lz + Math.sin(a) * 0.85
          );
          this.tmpDummy.rotation.set(0, 0, 0);
          this.tmpDummy.scale.set(1, 1, 1);
          this.tmpDummy.updateMatrix();
          this.lanternOrbitMoteInst.setMatrixAt(orbitCount++, this.tmpDummy.matrix);
        }
      }

      // Ground crystals per lantern
      this.tmpDummy.position.set(lx, ly, lz);
      this.tmpDummy.rotation.set(0, 0, 0);
      this.tmpDummy.scale.set(1, 1, 1);
      this.tmpDummy.updateMatrix();
      this.lanternCrystalInst.setMatrixAt(i, this.tmpDummy.matrix);
    }

    this.lanternPedestalInst.count = lCount;
    this.lanternRoofInst.count = lCount;
    this.lanternCoreInst.count = lCount;
    this.lanternCrystalInst.count = lCount;
    this.lanternTearInst.count = tearCount;
    this.lanternFlameInst.count = flameCount;
    this.lanternHaloInst.count = haloCount;
    this.lanternSafeRingInst.count = ringCount;
    this.lanternInnerRingInst.count = ringCount;
    this.lanternFuelBgInst.count = fuelBarCount;
    this.lanternFuelFillInst.count = fuelBarCount;
    this.lanternOrbitMoteInst.count = orbitCount;

    if (!this.staticLanternsReady) {
      this.lanternPedestalInst.instanceMatrix.needsUpdate = true;
      this.lanternCrystalInst.instanceMatrix.needsUpdate = true;
      this.staticLanternsReady = true;
    }
    this.lanternRoofInst.instanceMatrix.needsUpdate = true;
    this.lanternCoreInst.instanceMatrix.needsUpdate = true;
    if (tearCount > 0) this.lanternTearInst.instanceMatrix.needsUpdate = true;
    if (flameCount > 0) this.lanternFlameInst.instanceMatrix.needsUpdate = true;
    if (haloCount > 0) this.lanternHaloInst.instanceMatrix.needsUpdate = true;
    if (ringCount > 0) {
      this.lanternSafeRingInst.instanceMatrix.needsUpdate = true;
      this.lanternInnerRingInst.instanceMatrix.needsUpdate = true;
    }
    if (fuelBarCount > 0) {
      this.lanternFuelBgInst.instanceMatrix.needsUpdate = true;
      this.lanternFuelFillInst.instanceMatrix.needsUpdate = true;
    }
    if (orbitCount > 0) this.lanternOrbitMoteInst.instanceMatrix.needsUpdate = true;
    if (this.lanternCoreInst.instanceColor) this.lanternCoreInst.instanceColor.needsUpdate = true;
    if (this.lanternCrystalInst.instanceColor) this.lanternCrystalInst.instanceColor.needsUpdate = true;
    if (haloCount > 0 && this.lanternHaloInst.instanceColor) this.lanternHaloInst.instanceColor.needsUpdate = true;
    if (fuelBarCount > 0 && this.lanternFuelFillInst.instanceColor) this.lanternFuelFillInst.instanceColor.needsUpdate = true;

    const totalLanterns = Math.max(1, state.lanterns.length);
    const warmFactor = litCount / totalLanterns;
    (this.scene.background as THREE.Color).lerpColors(this.darkBg, this.warmBg, warmFactor);
    this.fog.color.lerpColors(this.darkFog, this.warmFog, warmFactor);
    this.fog.density = 0.0095 - warmFactor * 0.0035;
    this.hemiLight.intensity = computeAmbientIntensity(litCount, totalLanterns);
    this.dirLight.intensity = 0.55 + warmFactor * 0.4;

    // 3. Sync Motes at proper elevation pos[1] via GPU InstancedMesh
    const moteCount = Math.min(state.motes.length, MAX_INST_MOTES);
    for (let i = 0; i < moteCount; i++) {
      const m = state.motes[i];
      const bob = m.pos[1] + 0.65 + Math.sin(elapsedSec * 3.6 + m.pos[0] * 0.7) * 0.16;
      this.tmpDummy.position.set(m.pos[0], bob, m.pos[2]);
      this.tmpDummy.rotation.set(0, 0, 0);
      this.tmpDummy.scale.setScalar(1);
      this.tmpDummy.updateMatrix();
      this.moteCoreInst.setMatrixAt(i, this.tmpDummy.matrix);
      this.tmpColor.setHex(m.kind === 'dropped' ? PALETTE.moteGold : PALETTE.moteGlow);
      this.moteCoreInst.setColorAt(i, this.tmpColor);

      this.tmpDummy.lookAt(camX, camY, camZ);
      this.tmpDummy.updateMatrix();
      this.moteHaloInst.setMatrixAt(i, this.tmpDummy.matrix);
      this.tmpColor.setHex(m.kind === 'dropped' ? PALETTE.goldUi : PALETTE.moteGold);
      this.moteHaloInst.setColorAt(i, this.tmpColor);
    }
    this.moteCoreInst.count = moteCount;
    this.moteHaloInst.count = moteCount;
    this.moteCoreInst.instanceMatrix.needsUpdate = true;
    this.moteHaloInst.instanceMatrix.needsUpdate = true;
    if (this.moteCoreInst.instanceColor) this.moteCoreInst.instanceColor.needsUpdate = true;
    if (this.moteHaloInst.instanceColor) this.moteHaloInst.instanceColor.needsUpdate = true;

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

    // 6. Sync Shades via GPU InstancedMesh batches
    const shadeCount = Math.min(state.shades.length, MAX_INST_SHADES);
    let stunStarIdx = 0;
    let drainBeamIdx = 0;
    const activeEyeHex = colorblind ? PALETTE.shadeEyeCb : PALETTE.shadeEye;

    for (let i = 0; i < shadeCount; i++) {
      const s = state.shades[i];
      const prevShade = prevShadePositions.get(s.id) ?? s.pos;
      const sx = prevShade[0] + (s.pos[0] - prevShade[0]) * alpha;
      const sy = prevShade[1] + (s.pos[1] - prevShade[1]) * alpha;
      const sz = prevShade[2] + (s.pos[2] - prevShade[2]) * alpha;

      const spawnScale =
        s.state === 'spawning' ? Math.max(0.25, 1 - s.stateTicksLeft / 30) : 1.0;
      const hover =
        s.state === 'stunned'
          ? -0.08
          : s.state === 'drain'
            ? 0.25 + Math.sin(elapsedSec * 9) * 0.12
            : Math.sin(elapsedSec * 4.5 + s.pos[0]) * 0.14;

      const drainTarget =
        s.state === 'drain' && s.targetLanternId
          ? state.lanterns.find((l) => l.id === s.targetLanternId)
          : undefined;
      const lookX = drainTarget ? drainTarget.pos[0] : renderPlayerPos[0];
      const lookZ = drainTarget ? drainTarget.pos[2] : renderPlayerPos[2];

      this.tmpDummy.position.set(sx, sy + 0.9 + hover, sz);
      this.tmpDummy.rotation.set(s.state === 'drain' ? 0.28 : 0, Math.atan2(lookX - sx, lookZ - sz), 0);
      this.tmpDummy.scale.setScalar(spawnScale);
      this.tmpDummy.updateMatrix();
      this.tmpParentMat.copy(this.tmpDummy.matrix);

      // Body (+ baked horns) & eyes & swirling tri-wisps (1 instance each instead of 8!)
      this.shadeBodyInst.setMatrixAt(i, this.tmpParentMat);
      this.tmpColor.setHex(
        s.state === 'stunned'
          ? PALETTE.shadeStun
          : s.state === 'drain'
            ? colorblind
              ? 0x0b395c
              : 0x35145c
            : PALETTE.shadeBody
      );
      this.shadeBodyInst.setColorAt(i, this.tmpColor);

      const eyeHex =
        s.state === 'stunned'
          ? PALETTE.moteGold
          : s.state === 'recoil'
            ? PALETTE.drifterSteel
            : activeEyeHex;
      this.tmpColor.setHex(eyeHex);
      this.shadeEyeInst.setMatrixAt(i, this.tmpParentMat);
      this.shadeEyeInst.setColorAt(i, this.tmpColor);

      const wispRate = s.state === 'stunned' ? 0.8 : 3.0;
      const wispScale = s.state === 'stunned' ? 0.78 : 1.0;
      this.tmpLocal.position.set(0, 0, 0);
      this.tmpLocal.rotation.set(0, elapsedSec * wispRate, 0);
      this.tmpLocal.scale.set(wispScale, 1, wispScale);
      this.tmpLocal.updateMatrix();
      this.tmpChildMat.multiplyMatrices(this.tmpParentMat, this.tmpLocal.matrix);
      this.shadeWispInst.setMatrixAt(i, this.tmpChildMat);

      // Stun stars (only emitted when stunned)
      if (s.state === 'stunned' && stunStarIdx + 3 <= MAX_INST_SHADES * 3) {
        const starBaseY = sy + 0.9 + hover + 1.05 * spawnScale;
        const spin = elapsedSec * 5;
        this.tmpLocal.rotation.set(0, spin, 0);
        this.tmpLocal.scale.setScalar(spawnScale);
        for (let k = 0; k < 3; k++) {
          const sa = spin + (k / 3) * Math.PI * 2;
          this.tmpLocal.position.set(
            sx + Math.cos(sa) * 0.52 * spawnScale,
            starBaseY,
            sz + Math.sin(sa) * 0.52 * spawnScale
          );
          this.tmpLocal.updateMatrix();
          this.shadeStunStarInst.setMatrixAt(stunStarIdx++, this.tmpLocal.matrix);
        }
      }

      // Drain beam (only emitted when draining a weak lit lantern)
      if (s.state === 'drain' && drainTarget && drainBeamIdx < MAX_INST_DRAIN_BEAMS) {
        const bsy = sy + 0.95 + hover;
        const tx = drainTarget.pos[0];
        const ty = drainTarget.pos[1] + 3.25;
        const tz = drainTarget.pos[2];
        const dist = Math.hypot(tx - sx, ty - bsy, tz - sz);
        if (dist > 0.05) {
          this.tmpDummy.position.set((sx + tx) * 0.5, (bsy + ty) * 0.5, (sz + tz) * 0.5);
          this.tmpDummy.lookAt(tx, ty, tz);
          const pulse = 1 + Math.sin(elapsedSec * 14) * 0.22;
          this.tmpDummy.scale.set(pulse, pulse, dist);
          this.tmpDummy.updateMatrix();
          this.shadeDrainBeamInst.setMatrixAt(drainBeamIdx, this.tmpDummy.matrix);
          this.tmpColor.setHex(activeEyeHex);
          this.shadeDrainBeamInst.setColorAt(drainBeamIdx, this.tmpColor);
          drainBeamIdx += 1;
        }
      }
    }

    this.shadeBodyInst.count = shadeCount;
    this.shadeEyeInst.count = shadeCount;
    this.shadeWispInst.count = shadeCount;
    this.shadeStunStarInst.count = stunStarIdx;
    this.shadeDrainBeamInst.count = drainBeamIdx;

    this.shadeBodyInst.instanceMatrix.needsUpdate = true;
    this.shadeEyeInst.instanceMatrix.needsUpdate = true;
    this.shadeWispInst.instanceMatrix.needsUpdate = true;
    this.shadeStunStarInst.instanceMatrix.needsUpdate = true;
    this.shadeDrainBeamInst.instanceMatrix.needsUpdate = true;
    if (this.shadeBodyInst.instanceColor) this.shadeBodyInst.instanceColor.needsUpdate = true;
    if (this.shadeEyeInst.instanceColor) this.shadeEyeInst.instanceColor.needsUpdate = true;
    if (this.shadeDrainBeamInst.instanceColor) this.shadeDrainBeamInst.instanceColor.needsUpdate = true;

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

    // 10. Drift clouds & trees gently (~60Hz cap avoids redundant GPU VBO uploads at >600 FPS)
    if (this.lastEnvAnimSec < 0 || elapsedSec - this.lastEnvAnimSec >= 0.016) {
      this.lastEnvAnimSec = elapsedSec;
      if (this.cloudInst && this.cloudItems.length > 0) {
        for (let i = 0; i < this.cloudItems.length; i++) {
          const c = this.cloudItems[i];
          this.tmpDummy.position.set(
            c.x,
            c.baseY + Math.sin(elapsedSec * 0.45 + c.clusterIdx) * 0.35,
            c.z
          );
          this.tmpDummy.rotation.set(0, 0, 0);
          this.tmpDummy.scale.set(c.sx, c.sy, c.sz);
          this.tmpDummy.updateMatrix();
          this.cloudInst.setMatrixAt(i, this.tmpDummy.matrix);
        }
        this.cloudInst.instanceMatrix.needsUpdate = true;
      }
      for (const batch of this.treeCrownInsts) {
        for (const item of batch.items) {
          this.tmpDummy.position.set(item.x, item.y, item.z);
          this.tmpDummy.rotation.set(0, 0, Math.sin(elapsedSec * 1.3 + item.idx) * 0.03);
          this.tmpDummy.scale.set(1, 1, 1);
          this.tmpDummy.updateMatrix();
          batch.inst.setMatrixAt(item.idx, this.tmpDummy.matrix);
        }
        batch.inst.instanceMatrix.needsUpdate = true;
      }
    }

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
    this.disposeObjectResources(this.scene);
  }
}
