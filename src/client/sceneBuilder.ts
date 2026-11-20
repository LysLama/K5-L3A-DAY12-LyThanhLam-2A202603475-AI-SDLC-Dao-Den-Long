import * as THREE from 'three';
import { ISLAND_RADIUS, TUNING } from '../sim/constants';
import type { SimEvent, SimState, Vec3 } from '../sim/types';
import { VfxManager } from './particles';
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
  auraSprite: THREE.Sprite;
  tendrils: THREE.Mesh[];
  stunStarsGroup: THREE.Group;
}

export class IslandScene {
  readonly scene = new THREE.Scene();
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;
  private readonly vfx: VfxManager;

  private readonly groundTex: THREE.CanvasTexture;
  private readonly warmGlowTex: THREE.CanvasTexture;
  private readonly violetGlowTex: THREE.CanvasTexture;

  private readonly moteCoreGeo = new THREE.SphereGeometry(0.16, 12, 10);
  private readonly moteCoreMat = new THREE.MeshBasicMaterial({ color: '#ffe57f' });

  private readonly mayGroup = new THREE.Group();
  private readonly mayVisualPivot = new THREE.Group();
  private readonly mayLeftFoot = new THREE.Mesh();
  private readonly mayRightFoot = new THREE.Mesh();
  private readonly mayScarf = new THREE.Mesh();
  private readonly mayLanternPivot = new THREE.Group();
  private readonly mayLanternLight: THREE.PointLight;
  private readonly mayBodyMat: THREE.MeshStandardMaterial;

  private readonly cloudClusters: THREE.Group[] = [];
  private readonly treeCrowns: THREE.Group[] = [];
  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteVisuals = new Map<string, THREE.Group>();
  private readonly shadeVisuals = new Map<string, ShadeVisual>();

  private prevPlayerPos: Vec3 = [0, 0, 0];
  private dustCooldown = 0;

  private readonly darkBg = new THREE.Color('#0f0a21');
  private readonly warmBg = new THREE.Color('#2d1e42');
  private readonly darkFog = new THREE.Color('#130d29');
  private readonly warmFog = new THREE.Color('#3a254d');

  constructor(initialState: SimState) {
    this.groundTex = createIslandGroundTexture();
    this.warmGlowTex = createGlowTexture('rgba(255,248,210,1)', 'rgba(255,175,60,0.6)');
    this.violetGlowTex = createGlowTexture('rgba(235,170,255,0.9)', 'rgba(130,45,210,0.35)');
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
    this.mayScarf.geometry = mayParts.scarfGeo;
    this.mayScarf.material = mayParts.scarfMat;
    this.scene.add(this.mayGroup);

    for (const l of initialState.lanterns) {
      this.createLanternVisual(l.id, l.pos);
    }
    this.prevPlayerPos = [...initialState.player.pos];
    this.sync(initialState, [], 0, 0);
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

    // Perimeter stones & tiny glowing boundary posts
    const stoneGeo = new THREE.DodecahedronGeometry(0.75, 0);
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#39355c',
      roughness: 0.9,
      flatShading: true
    });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + 0.12;
      if (Math.abs(a - Math.PI / 2) < 0.18) continue; // Keep pier clear
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

    // Stylized fairytale spirit pine trees nestled between lantern sectors (R = 28..32m)
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
    // Glowing crescent-era night moon
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
        blending: THREE.AdditiveBlending
      })
    );
    moonGlow.scale.set(24, 24, 1);
    moonGroup.add(moonMesh, moonGlow);
    this.scene.add(moonGroup);

    // Twinkling stars
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

    // Billowing sea of clouds below the island
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
    scarfGeo: THREE.BufferGeometry;
    scarfMat: THREE.Material;
  } {
    this.mayGroup.add(this.mayVisualPivot);

    // Little boots
    const footGeo = new THREE.CapsuleGeometry(0.11, 0.14, 4, 8);
    const footMat = new THREE.MeshStandardMaterial({ color: '#392b4f', roughness: 0.8 });
    this.mayLeftFoot.position.set(-0.16, 0.14, 0);
    this.mayRightFoot.position.set(0.16, 0.14, 0);
    this.mayVisualPivot.add(this.mayLeftFoot, this.mayRightFoot);

    // Layered tunic & cloak
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#f5e7cb', roughness: 0.65 });
    const innerTunic = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.36, 0.65, 14),
      new THREE.MeshStandardMaterial({ color: '#453b70', roughness: 0.75 })
    );
    innerTunic.position.y = 0.48;
    this.mayVisualPivot.add(innerTunic);

    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.47, 0.92, 16), bodyMat);
    cloak.position.y = 0.68;
    this.mayVisualPivot.add(cloak);

    // Flowing golden sash scarf behind shoulder
    const scarfGeo = new THREE.BoxGeometry(0.18, 0.08, 0.55);
    const scarfMat = new THREE.MeshStandardMaterial({
      color: '#ffad42',
      emissive: '#663400',
      roughness: 0.6
    });
    this.mayScarf.position.set(0, 1.02, -0.34);
    this.mayVisualPivot.add(this.mayScarf);

    // Head & expressive eyes
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 16, 14),
      new THREE.MeshStandardMaterial({ color: '#ffe3c7', roughness: 0.6 })
    );
    head.position.y = 1.24;
    this.mayVisualPivot.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#241838' });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.09, 1.25, 0.24);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.09, 1.25, 0.24);
    this.mayVisualPivot.add(eyeL, eyeR);

    // Conical Nón Lá with woven rim band
    const hatMat = new THREE.MeshStandardMaterial({ color: '#ebca7f', roughness: 0.72 });
    const nonLa = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.38, 24), hatMat);
    nonLa.position.y = 1.5;
    this.mayVisualPivot.add(nonLa);

    const hatRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.03, 8, 24),
      new THREE.MeshStandardMaterial({ color: '#9c6e38', roughness: 0.8 })
    );
    hatRim.rotation.x = Math.PI / 2;
    hatRim.position.y = 1.32;
    this.mayVisualPivot.add(hatRim);

    // Ornate hanging warm lantern from the hat brim (visible from rear 3rd-person camera)
    this.mayLanternPivot.position.set(-0.58, 1.32, 0.22);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.24, 6),
      new THREE.MeshBasicMaterial({ color: '#c4965a' })
    );
    cord.position.y = -0.12;
    this.mayLanternPivot.add(cord);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.09, 8),
      new THREE.MeshStandardMaterial({ color: '#593d2b', roughness: 0.7 })
    );
    cap.position.y = -0.22;
    this.mayLanternPivot.add(cap);

    const miniLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#ffd269' })
    );
    miniLantern.position.y = -0.32;
    this.mayLanternPivot.add(miniLantern);

    const lanternHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.warmGlowTex,
        color: '#ffb649',
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      })
    );
    lanternHalo.scale.set(0.85, 0.85, 1);
    lanternHalo.position.y = -0.32;
    this.mayLanternPivot.add(lanternHalo);

    const lanternLight = new THREE.PointLight('#ff9e3d', 3.2, 13, 1.45);
    lanternLight.position.y = -0.32;
    this.mayLanternPivot.add(lanternLight);

    this.mayVisualPivot.add(this.mayLanternPivot);
    return { bodyMat, lanternLight, footGeo, footMat, scarfGeo, scarfMat };
  }

  private createLanternVisual(id: string, pos: Vec3): void {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const stoneMat = new THREE.MeshStandardMaterial({ color: '#524c75', roughness: 0.82 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: '#3b2b42', roughness: 0.8 });

    // Layered octagonal shrine pedestal
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

    // Double pagoda roof + spire
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
        blending: THREE.AdditiveBlending
      })
    );
    flameHalo.scale.set(2.8, 2.8, 1);
    flameHalo.position.y = 3.25;
    group.add(flameHalo);

    const light = new THREE.PointLight('#ffa23a', 0, 22, 1.45);
    light.position.y = 3.3;
    group.add(light);

    // Double concentric safe_radius ground rings
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

    // Spirit crystals around pedestal base
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

    // Orbiting progress motes (1..4) reflecting deposited light
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
      color: '#10061c',
      emissive: '#351054',
      emissiveIntensity: 0.95,
      roughness: 0.55
    });

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 14), bodyMat);
    torso.scale.set(1, 1.38, 1);
    group.add(torso);

    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.72, 8), bodyMat);
    hood.position.y = 0.66;
    group.add(hood);

    const cloakTail = new THREE.Mesh(new THREE.ConeGeometry(0.64, 0.95, 10), bodyMat);
    cloakTail.position.y = -0.36;
    cloakTail.rotation.x = Math.PI;
    group.add(cloakTail);

    const eyeMat = new THREE.MeshBasicMaterial({ color: '#e67aff' });
    const eyeGeo = new THREE.SphereGeometry(0.085, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.19, 0.2, 0.49);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.19, 0.2, 0.49);
    group.add(eyeL, eyeR);

    const auraSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.violetGlowTex,
        color: '#a338ff',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending
      })
    );
    auraSprite.scale.set(2.3, 2.3, 1);
    group.add(auraSprite);

    const tendrils: THREE.Mesh[] = [];
    const tendrilGeo = new THREE.SphereGeometry(0.14, 8, 6);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(tendrilGeo, bodyMat);
      group.add(t);
      tendrils.push(t);
    }

    const stunStarsGroup = new THREE.Group();
    stunStarsGroup.position.y = 1.15;
    const starGeo = new THREE.OctahedronGeometry(0.11, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: '#ffe066' });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const star = new THREE.Mesh(starGeo, starMat);
      star.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      stunStarsGroup.add(star);
    }
    stunStarsGroup.visible = false;
    group.add(stunStarsGroup);

    const visual: ShadeVisual = { group, bodyMat, eyeMat, auraSprite, tendrils, stunStarsGroup };
    this.shadeVisuals.set(id, visual);
    this.scene.add(group);
    return visual;
  }

  sync(state: SimState, events: ReadonlyArray<SimEvent>, elapsedSec: number, simDt: number): void {
    const p = state.player;
    const dxMove = p.pos[0] - this.prevPlayerPos[0];
    const dzMove = p.pos[2] - this.prevPlayerPos[2];
    const isMoving = Math.hypot(dxMove, dzMove) > 0.004 && p.pos[1] === 0;
    this.prevPlayerPos = [p.pos[0], p.pos[1], p.pos[2]];

    // 1. Update Mây animation & hat lantern
    this.mayGroup.position.set(p.pos[0], p.pos[1], p.pos[2]);
    this.mayGroup.rotation.y = Math.atan2(p.facing[0], p.facing[1]);

    if (isMoving) {
      const stride = elapsedSec * 14;
      this.mayVisualPivot.position.y = Math.abs(Math.sin(stride)) * 0.08;
      this.mayVisualPivot.rotation.x = 0.09;
      this.mayLeftFoot.position.z = Math.sin(stride) * 0.22;
      this.mayRightFoot.position.z = -Math.sin(stride) * 0.22;
      this.mayScarf.rotation.x = 0.28 + Math.sin(stride * 1.5) * 0.14;
      this.dustCooldown -= simDt;
      if (this.dustCooldown <= 0) {
        this.dustCooldown = 0.16;
        this.vfx.spawnDust(p.pos);
      }
    } else {
      this.mayVisualPivot.position.y = Math.sin(elapsedSec * 2.6) * 0.02;
      this.mayVisualPivot.rotation.x = 0;
      this.mayLeftFoot.position.z = 0;
      this.mayRightFoot.position.z = 0;
      this.mayScarf.rotation.x = 0.1 + Math.sin(elapsedSec * 3) * 0.05;
    }

    this.mayLanternPivot.rotation.z = Math.sin(elapsedSec * 5.2) * 0.13 + (isMoving ? 0.1 : 0);
    this.mayLanternPivot.rotation.x = isMoving ? -0.18 : Math.cos(elapsedSec * 3.1) * 0.05;
    this.mayLanternLight.intensity = 3.0 + Math.sin(elapsedSec * 8) * 0.3;
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

    // 4. Sync Shades
    const activeShadeIds = new Set<string>();
    for (const s of state.shades) {
      activeShadeIds.add(s.id);
      const vis = this.shadeVisuals.get(s.id) ?? this.createShadeVisual(s.id);
      const hover = s.state === 'stunned' ? -0.1 : Math.sin(elapsedSec * 4.5 + s.pos[0]) * 0.14;
      vis.group.position.set(s.pos[0], s.pos[1] + hover, s.pos[2]);
      vis.group.rotation.y = Math.atan2(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]);

      vis.tendrils.forEach((t, idx) => {
        const a = elapsedSec * (s.state === 'stunned' ? 0.8 : 3.2) + (idx / 4) * Math.PI * 2;
        const r = s.state === 'stunned' ? 0.52 : 0.75;
        t.position.set(Math.cos(a) * r, Math.sin(elapsedSec * 4 + idx) * 0.22, Math.sin(a) * r);
      });

      if (s.state === 'stunned') {
        vis.bodyMat.emissive.set('#6b531c');
        vis.eyeMat.color.set('#ffe27a');
        vis.auraSprite.material.color.set('#ffc94d');
        vis.auraSprite.material.opacity = 0.35;
        vis.stunStarsGroup.visible = true;
        vis.stunStarsGroup.rotation.y = elapsedSec * 5;
      } else {
        vis.bodyMat.emissive.set('#351054');
        vis.eyeMat.color.set('#e67aff');
        vis.auraSprite.material.color.set('#a338ff');
        vis.auraSprite.material.opacity = 0.55;
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
        this.vfx.spawnBurst(p.pos, 0xffe066, 10, 3.2, 3.4, 1.0);
      } else if (ev.name === 'deposit') {
        const target = state.lanterns.find((l) => l.id === ev.data.lantern_id);
        if (target) this.vfx.spawnDepositStream(p.pos, target.pos);
      } else if (ev.name === 'lantern_lit') {
        const target = state.lanterns.find((l) => l.id === ev.data.lantern_id);
        if (target) this.vfx.spawnLanternCelebration(target.pos);
      } else if (ev.name === 'pulse') {
        this.vfx.spawnPulseEffect(p.pos);
      } else if (ev.name === 'player_hit') {
        this.vfx.spawnBurst(p.pos, ev.data.by === 'fall' ? 0x82b7ff : 0xc44dff, 16, 4.5, 2.5, 1.15);
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
  }

  dispose(): void {
    this.vfx.dispose();
    this.groundTex.dispose();
    this.warmGlowTex.dispose();
    this.violetGlowTex.dispose();
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
