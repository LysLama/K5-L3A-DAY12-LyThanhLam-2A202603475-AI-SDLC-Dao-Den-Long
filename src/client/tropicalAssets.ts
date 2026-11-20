import * as THREE from 'three';
import { createRng } from '../sim/rng';
import { getMapConfig } from '../sim/maps';
import type { NightId } from '../sim/types';
import { colorizeGeo, mergeParts } from './characterModels';
import { isClearPlayableSpot, sampleIslandElevation } from './terrainBuilder';

export interface TropicalAssetCatalog {
  coconutTrunk: THREE.BufferGeometry;
  coconutCrown: THREE.BufferGeometry;
  canopyTrunk: THREE.BufferGeometry;
  canopyCrown: THREE.BufferGeometry;
  arecaTrunk: THREE.BufferGeometry;
  arecaCrown: THREE.BufferGeometry;
  highlandTrunk: THREE.BufferGeometry;
  highlandCrown: THREE.BufferGeometry;
  bananaClump: THREE.BufferGeometry;
  bambooClump: THREE.BufferGeometry;
  fernClump: THREE.BufferGeometry;
  mossBoulder: THREE.BufferGeometry;
  pebbleCluster: THREE.BufferGeometry;
  grassSmall: THREE.BufferGeometry;
  grassTall: THREE.BufferGeometry;
  flowerCluster: THREE.BufferGeometry;
  lotusCluster: THREE.BufferGeometry;
}

export interface PlacementItem {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  crownX: number;
  crownY: number;
  crownZ: number;
  idx: number;
}

export interface SwayBatch {
  inst: THREE.InstancedMesh;
  items: { x: number; y: number; z: number; yaw: number; scale: number; idx: number }[];
  amplitude: number;
}

export interface NightPlacementPlan {
  coconutPalms: PlacementItem[];
  canopyTrees: PlacementItem[];
  arecaPalms: PlacementItem[];
  highlandTrees: PlacementItem[];
  bananaClumps: PlacementItem[];
  bambooClumps: PlacementItem[];
  ferns: PlacementItem[];
  boulders: PlacementItem[];
  pebbles: PlacementItem[];
  grassSmall: PlacementItem[];
  grassTall: PlacementItem[];
  flowers: PlacementItem[];
  lotusClusters: PlacementItem[];
}

function transformGeo(
  geo: THREE.BufferGeometry,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1]
): THREE.BufferGeometry {
  geo.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(scale[0], scale[1], scale[2])
    )
  );
  return geo;
}

const COCONUT_TIP_X = 0.72;
const COCONUT_TIP_Y = 3.95;

/**
 * Builds vertex-colored Vietnamese tropical trees, understory foliage, rocks, grass,
 * theme flowers, and Night 2 lotus pads cleanly within strict triangle budgets.
 */
export function createTropicalAssetCatalog(night: NightId): TropicalAssetCatalog {
  // 1. Curved coastal coconut palm + hanging coconuts + arched feather fronds
  const cocoTrunkParts: THREE.BufferGeometry[] = [];
  const segSpecs: [number, number, number, number, number][] = [
    [0.0, 0.48, 0.08, 0.24, 0.19],
    [0.14, 1.38, 0.16, 0.19, 0.16],
    [0.36, 2.26, 0.22, 0.16, 0.135],
    [0.58, 3.12, 0.24, 0.135, 0.11]
  ];
  for (let i = 0; i < segSpecs.length; i++) {
    const [sx, sy, tiltZ, rb, rt] = segSpecs[i];
    cocoTrunkParts.push(
      colorizeGeo(
        transformGeo(new THREE.CylinderGeometry(rt, rb, 1.02, 5), [sx, sy, 0], [0, 0, -tiltZ]),
        i % 2 === 0 ? '#73573d' : '#856749'
      )
    );
  }
  const cocoCrownParts: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 3; c++) {
    const ca = (c / 3) * Math.PI * 2;
    cocoCrownParts.push(
      colorizeGeo(
        transformGeo(
          new THREE.IcosahedronGeometry(0.14, 0),
          [Math.cos(ca) * 0.16, -0.14, Math.sin(ca) * 0.16],
          [0, 0, 0],
          [0.9, 1.15, 0.9]
        ),
        c === 0 ? '#6e5226' : '#587032'
      )
    );
  }
  for (let f = 0; f < 7; f++) {
    const fa = (f / 7) * Math.PI * 2;
    const frond = transformGeo(
      new THREE.ConeGeometry(0.32, 2.15, 3),
      [1.0, -0.05, 0],
      [0, 0, -Math.PI * 0.62],
      [1, 1, 0.52]
    );
    frond.rotateY(fa);
    cocoCrownParts.push(colorizeGeo(frond, f % 2 === 0 ? '#2b6147' : '#357554'));
  }

  // 2. Tropical banyan/canopy tree: flared buttress roots + forked boughs + wide layered crown
  const canopyTrunkParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.24, 0.36, 2.45, 6), [0, 1.22, 0]), '#573c28'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.22, 0.95, 4), [0.35, 2.55, 0.1], [0, 0, -0.52]), '#4c3422'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.20, 0.95, 4), [-0.32, 2.6, -0.15], [0.22, 0, 0.48]), '#4c3422')
  ];
  for (let r = 0; r < 3; r++) {
    const ra = (r / 3) * Math.PI * 2;
    canopyTrunkParts.push(
      colorizeGeo(
        transformGeo(
          new THREE.ConeGeometry(0.22, 0.9, 3),
          [Math.cos(ra) * 0.36, 0.32, Math.sin(ra) * 0.36],
          [Math.sin(ra) * 0.45, ra, -Math.cos(ra) * 0.45]
        ),
        '#432e1e'
      )
    );
  }
  const canopyCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.45, 0), [0, 0.35, 0], [0, 0.2, 0], [1.28, 0.72, 1.22]), '#214d3d'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.12, 0), [-0.85, 0.15, 0.35], [0, 0.6, 0], [1.18, 0.68, 1.1]), '#2b614b'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.08, 0), [0.85, 0.2, -0.35], [0, 1.1, 0], [1.15, 0.65, 1.1]), '#285a47'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.95, 0), [0.1, 0.85, 0.15], [0, 0.4, 0], [1.18, 0.64, 1.15]), '#367559')
  ];

  // 3. Tall slender ringed Areca Palm (Cau Việt Nam)
  const arecaTrunk = mergeParts([
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.11, 0.19, 3.9, 6), [0, 1.95, 0]), '#7d6b52'),
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.125, 0.12, 0.55, 6), [0, 4.15, 0]), '#3b7350')
  ]);
  const arecaCrownParts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 6; f++) {
    const fa = (f / 6) * Math.PI * 2;
    const frond = transformGeo(
      new THREE.ConeGeometry(0.28, 1.9, 3),
      [0.75, 0.16, 0],
      [0, 0, -Math.PI * 0.36],
      [1, 1, 0.5]
    );
    frond.rotateY(fa);
    arecaCrownParts.push(colorizeGeo(frond, f % 2 === 0 ? '#2f6a4f' : '#3d805f'));
  }

  // 4. Windswept Night 3 highland hardwood/pine tree
  const highlandTrunk = mergeParts([
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.16, 0.28, 2.75, 6), [0.12, 1.35, 0], [0, 0, -0.09]), '#4a3224'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.14, 0.85, 4), [0.42, 2.3, 0.12], [0.2, 0, -0.65]), '#3d281c')
  ]);
  const highlandCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.ConeGeometry(1.55, 1.45, 6), [0.15, 0.2, 0], [0, 0, -0.08]), '#1e4238'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(1.18, 1.35, 6), [0.25, 1.1, 0], [0, 0.4, -0.1]), '#265245'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.75, 1.15, 6), [0.34, 1.9, 0], [0, 0.8, -0.12]), '#306655')
  ];

  // 5. Wild banana / elephant-ear clump (Chuối rừng / Ráy lá bản rộng nhiệt đới)
  const bananaParts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const ba = (b / 5) * Math.PI * 2 + 0.2;
    const stalk = transformGeo(new THREE.CylinderGeometry(0.045, 0.065, 0.78, 3), [0.1, 0.38, 0], [0, 0, -0.26]);
    stalk.rotateY(ba);
    bananaParts.push(colorizeGeo(stalk, '#487a4e'));

    const leaf = transformGeo(
      new THREE.BoxGeometry(1.12, 0.04, 0.44),
      [0.62, 0.78 + (b % 2) * 0.14, 0],
      [0, 0, 0.42]
    );
    leaf.rotateY(ba);
    bananaParts.push(colorizeGeo(leaf, b % 2 === 0 ? '#3e8a5e' : '#53a670'));
  }

  // 6. Segmented bamboo thicket (Bụi Tre Trúc)
  const bambooParts: THREE.BufferGeometry[] = [];
  const culmOffsets: [number, number, number, number][] = [
    [-0.14, -0.08, 0.08, 3.1],
    [0.14, 0.06, -0.10, 3.6],
    [0.02, -0.15, 0.06, 2.8],
    [-0.08, 0.14, -0.05, 3.3]
  ];
  for (let i = 0; i < culmOffsets.length; i++) {
    const [cx, cz, tilt, h] = culmOffsets[i];
    bambooParts.push(
      colorizeGeo(
        transformGeo(new THREE.CylinderGeometry(0.055, 0.075, h, 5), [cx, h * 0.5, cz], [tilt, 0, -tilt * 0.8]),
        i % 2 === 0 ? '#3e7348' : '#4d8754'
      ),
      colorizeGeo(
        transformGeo(new THREE.ConeGeometry(0.45, 0.85, 4), [cx - tilt * 0.5, h * 0.92, cz + tilt * 0.5], [0, i * 0.7, 0]),
        '#2d5e3f'
      )
    );
  }

  // 7. Tropical ferns (Dương xỉ)
  const fernParts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 6; f++) {
    const fa = (f / 6) * Math.PI * 2;
    const frond = transformGeo(
      new THREE.ConeGeometry(0.18, 0.82, 3),
      [0.34, 0.24, 0],
      [0, 0, -1.05],
      [0.22, 1, 1.05]
    );
    frond.rotateY(fa);
    fernParts.push(colorizeGeo(frond, f % 2 === 0 ? '#2b5e49' : '#3e7d5e'));
  }

  // 8. Mossy cliff boulder + small pebble cluster
  const mossBoulder = mergeParts([
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.62, 0), [0, 0.34, 0], [0.2, 0.4, 0.1], [1.2, 0.78, 1.0]), '#40475c'),
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.38, 0), [0.42, 0.22, 0.25], [0.1, 1.0, 0.3], [1.1, 0.7, 0.9]), '#353c4f'),
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.42, 0), [-0.05, 0.62, 0], [0, 0.2, 0], [1.1, 0.34, 0.95]), '#2e5947')
  ]);
  const pebbleCluster = mergeParts([
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.22, 0), [0, 0.11, 0], [0.1, 0.3, 0], [1.2, 0.65, 0.95]), '#4e556b'),
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.15, 0), [0.24, 0.08, 0.14], [0.2, 0.8, 0], [1.1, 0.6, 1.0]), '#5c637a')
  ]);

  // 9. Small & Tall Grass Tufts (Cỏ thấp & Cỏ lau cao)
  const smallGrassParts: THREE.BufferGeometry[] = [];
  for (let g = 0; g < 5; g++) {
    const ga = (g / 5) * Math.PI * 2;
    const blade = transformGeo(
      new THREE.ConeGeometry(0.085, 0.38 + (g % 2) * 0.1, 3),
      [Math.cos(ga) * 0.1, 0.19, Math.sin(ga) * 0.1],
      [Math.sin(ga) * 0.32, ga, -Math.cos(ga) * 0.32],
      [0.35, 1, 1]
    );
    smallGrassParts.push(colorizeGeo(blade, g % 2 === 0 ? '#377057' : '#4a8f6d'));
  }

  const tallGrassParts: THREE.BufferGeometry[] = [];
  for (let g = 0; g < 6; g++) {
    const ga = (g / 6) * Math.PI * 2;
    const reed = transformGeo(
      new THREE.ConeGeometry(0.08, 0.88 + (g % 2) * 0.18, 3),
      [Math.cos(ga) * 0.12, 0.42, Math.sin(ga) * 0.12],
      [Math.sin(ga) * 0.28, ga, -Math.cos(ga) * 0.28],
      [0.3, 1, 1]
    );
    tallGrassParts.push(colorizeGeo(reed, g % 2 === 0 ? '#3b7357' : '#4e8a66'));
    if (g < 2) {
      const plume = transformGeo(
        new THREE.ConeGeometry(0.055, 0.26, 3),
        [Math.cos(ga) * 0.24, 0.92, Math.sin(ga) * 0.24],
        [Math.sin(ga) * 0.42, ga, -Math.cos(ga) * 0.42]
      );
      tallGrassParts.push(colorizeGeo(plume, '#cfc49f'));
    }
  }

  // 10. Theme wildflowers (cúc vàng-trắng / hoa sim tím-hồng / hoa rừng kem)
  const petalHex = night === 1 ? '#ffe37a' : night === 2 ? '#e388cc' : '#f2e8c4';
  const petalAlt = night === 1 ? '#fff7dc' : night === 2 ? '#f7b9e6' : '#ffd285';
  const flowerParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.24, 0.16, 4), [0, 0.08, 0], [0, 0, 0]), '#2c6149')
  ];
  const bloomOffsets: [number, number, number][] = [
    [0, 0.28, 0],
    [-0.14, 0.22, 0.10],
    [0.14, 0.23, -0.09]
  ];
  for (let f = 0; f < bloomOffsets.length; f++) {
    const [bx, by, bz] = bloomOffsets[f];
    flowerParts.push(
      colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.015, 0.02, by, 3), [bx, by * 0.5, bz]), '#3a7553'),
      colorizeGeo(
        transformGeo(new THREE.ConeGeometry(0.11, 0.08, 5), [bx, by, bz], [Math.PI, f * 0.6, 0]),
        f % 2 === 0 ? petalHex : petalAlt
      )
    );
  }

  // 11. Floating lotus leaf pads + pink-white lotus blossom (Đầm Sen Night 2)
  const lotusParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.65, 0.65, 0.03, 9), [0, 0.015, 0]), '#2c6b4d'),
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 8), [0.75, 0.015, 0.35]), '#367d59'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.24, 0.22, 6), [0.1, 0.12, -0.05], [Math.PI, 0, 0]), '#f08db8'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.15, 0.22, 5), [0.1, 0.16, -0.05], [Math.PI, 0.4, 0]), '#ffeaf3'),
    colorizeGeo(transformGeo(new THREE.OctahedronGeometry(0.06, 0), [0.1, 0.24, -0.05]), '#f2c14e')
  ];

  return {
    coconutTrunk: mergeParts(cocoTrunkParts),
    coconutCrown: mergeParts(cocoCrownParts),
    canopyTrunk: mergeParts(canopyTrunkParts),
    canopyCrown: mergeParts(canopyCrownParts),
    arecaTrunk,
    arecaCrown: mergeParts(arecaCrownParts),
    highlandTrunk,
    highlandCrown: mergeParts(highlandCrownParts),
    bananaClump: mergeParts(bananaParts),
    bambooClump: mergeParts(bambooParts),
    fernClump: mergeParts(fernParts),
    mossBoulder,
    pebbleCluster,
    grassSmall: mergeParts(smallGrassParts),
    grassTall: mergeParts(tallGrassParts),
    flowerCluster: mergeParts(flowerParts),
    lotusCluster: mergeParts(lotusParts)
  };
}

/**
 * Deterministically samples obstacle-safe coordinates across every island disc for rich Vietnamese tropical biomes.
 */
export function generateTropicalPlacementPlan(night: NightId): NightPlacementPlan {
  const rng = createRng(9100 + night * 409);
  const plan: NightPlacementPlan = {
    coconutPalms: [],
    canopyTrees: [],
    arecaPalms: [],
    highlandTrees: [],
    bananaClumps: [],
    bambooClumps: [],
    ferns: [],
    boulders: [],
    pebbles: [],
    grassSmall: [],
    grassTall: [],
    flowers: [],
    lotusClusters: []
  };

  const discs: { cx: number; r: number }[] =
    night === 1 ? [{ cx: 0, r: 40 }] : night === 2 ? [{ cx: 0, r: 28 }, { cx: 70, r: 28 }] : [{ cx: 0, r: 45 }];

  const tryPlace = (
    target: PlacementItem[],
    count: number,
    cx: number,
    radius: number,
    rMinRatio: number,
    rMaxRatio: number,
    clearanceMargin: number,
    scaleMin: number,
    scaleMax: number,
    crownOffset: [number, number, number] = [0, 0, 0],
    orientOutward = false
  ) => {
    let attempts = 0;
    let added = 0;
    while (added < count && attempts < count * 18) {
      attempts++;
      const angle = rng() * Math.PI * 2;
      const dist = radius * (rMinRatio + rng() * (rMaxRatio - rMinRatio));
      const x = cx + Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (!isClearPlayableSpot(night, cx, radius, x, z, clearanceMargin)) continue;
      const y = sampleIslandElevation(night, cx, radius, x, z);
      const scale = scaleMin + rng() * (scaleMax - scaleMin);
      const yaw = orientOutward ? -angle : rng() * Math.PI * 2;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const ox = (crownOffset[0] * cosY + crownOffset[2] * sinY) * scale;
      const oz = (-crownOffset[0] * sinY + crownOffset[2] * cosY) * scale;
      target.push({
        x,
        y,
        z,
        yaw,
        scale,
        crownX: x + ox,
        crownY: y + crownOffset[1] * scale,
        crownZ: z + oz,
        idx: target.length
      });
      added++;
    }
  };

  for (const { cx, r } of discs) {
    if (night === 1) {
      tryPlace(plan.coconutPalms, 16, cx, r, 0.68, 0.94, 0.85, 0.92, 1.28, [COCONUT_TIP_X, COCONUT_TIP_Y, 0], true);
      tryPlace(plan.canopyTrees, 14, cx, r, 0.50, 0.90, 1.15, 0.85, 1.25, [0, 2.5, 0]);
      tryPlace(plan.bananaClumps, 24, cx, r, 0.32, 0.92, 0.2, 0.85, 1.25);
      tryPlace(plan.bambooClumps, 14, cx, r, 0.60, 0.94, 0.45, 0.85, 1.25);
      tryPlace(plan.ferns, 36, cx, r, 0.22, 0.94, -0.35, 0.85, 1.35);
      tryPlace(plan.boulders, 24, cx, r, 0.38, 0.95, 0.65, 0.75, 1.35);
      tryPlace(plan.pebbles, 42, cx, r, 0.16, 0.95, -0.5, 0.75, 1.35);
      tryPlace(plan.grassSmall, 110, cx, r, 0.15, 0.95, -0.65, 0.8, 1.4);
      tryPlace(plan.grassTall, 44, cx, r, 0.48, 0.95, -0.35, 0.85, 1.35);
      tryPlace(plan.flowers, 44, cx, r, 0.18, 0.93, -0.55, 0.85, 1.35);
    } else if (night === 2) {
      tryPlace(plan.arecaPalms, 12, cx, r, 0.58, 0.92, 0.85, 0.9, 1.25, [0, 4.35, 0]);
      tryPlace(plan.canopyTrees, 7, cx, r, 0.52, 0.88, 1.1, 0.85, 1.15, [0, 2.45, 0]);
      tryPlace(plan.bananaClumps, 12, cx, r, 0.32, 0.92, 0.2, 0.85, 1.2);
      tryPlace(plan.bambooClumps, 8, cx, r, 0.58, 0.93, 0.4, 0.85, 1.2);
      tryPlace(plan.ferns, 20, cx, r, 0.20, 0.93, -0.4, 0.85, 1.3);
      tryPlace(plan.boulders, 12, cx, r, 0.38, 0.94, 0.65, 0.75, 1.3);
      tryPlace(plan.pebbles, 22, cx, r, 0.16, 0.95, -0.5, 0.75, 1.3);
      tryPlace(plan.grassSmall, 60, cx, r, 0.16, 0.94, -0.65, 0.8, 1.35);
      tryPlace(plan.grassTall, 22, cx, r, 0.48, 0.95, -0.4, 0.85, 1.3);
      tryPlace(plan.flowers, 24, cx, r, 0.18, 0.93, -0.55, 0.85, 1.35);
    } else {
      tryPlace(plan.highlandTrees, 20, cx, r, 0.58, 0.93, 1.0, 0.92, 1.32, [0.16, 2.55, 0]);
      tryPlace(plan.canopyTrees, 10, cx, r, 0.56, 0.90, 1.15, 0.85, 1.2, [0, 2.5, 0]);
      tryPlace(plan.bambooClumps, 18, cx, r, 0.56, 0.94, 0.4, 0.85, 1.25);
      tryPlace(plan.bananaClumps, 14, cx, r, 0.52, 0.92, 0.2, 0.85, 1.2);
      tryPlace(plan.ferns, 32, cx, r, 0.52, 0.94, -0.4, 0.85, 1.35);
      tryPlace(plan.boulders, 26, cx, r, 0.52, 0.95, 0.65, 0.8, 1.45);
      tryPlace(plan.pebbles, 38, cx, r, 0.46, 0.95, -0.5, 0.75, 1.3);
      tryPlace(plan.grassSmall, 95, cx, r, 0.48, 0.95, -0.65, 0.8, 1.4);
      tryPlace(plan.grassTall, 40, cx, r, 0.58, 0.96, -0.4, 0.85, 1.35);
      tryPlace(plan.flowers, 34, cx, r, 0.50, 0.93, -0.55, 0.85, 1.3);
    }
  }

  // Night 3 elevated sanctuary decor (Tier 1 at Y=3 & Tier 2 at Y=6 avoiding ramps/lamps/bell/motes)
  if (night === 3) {
    const cfg = getMapConfig(3);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 0.82 + 0.28; // +Z Tier 1 terrace
      const r = i % 2 === 0 ? 21.8 : 14.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const nearMote = cfg.moteSpawnPoints.some((m) => Math.hypot(m[0] - x, m[2] - z) < 1.8);
      const nearLamp = cfg.lanterns.some((l) => Math.hypot(l.pos[0] - x, l.pos[2] - z) < 3.4);
      if (nearMote || nearLamp || Math.hypot(x, z - 13) < 2.6) continue;
      plan.ferns.push({ x, y: 3.0, z, yaw: a, scale: 1.0, crownX: x, crownY: 3.0, crownZ: z, idx: plan.ferns.length });
      if (i % 2 === 0) {
        plan.flowers.push({ x: x + 0.5, y: 3.0, z: z - 0.3, yaw: -a, scale: 1.0, crownX: x, crownY: 3.0, crownZ: z, idx: plan.flowers.length });
      }
    }
  }

  // Night 2 floating lotus lagoon clusters flanking the bridge channel at water Y = -10.42
  if (night === 2) {
    for (let i = 0; i < 24; i++) {
      const lx = 20 + rng() * 30;
      const side = i % 2 === 0 ? 1 : -1;
      const lz = side * (3.8 + rng() * 16);
      plan.lotusClusters.push({
        x: lx,
        y: -10.42,
        z: lz,
        yaw: rng() * Math.PI * 2,
        scale: 0.95 + rng() * 0.75,
        crownX: lx,
        crownY: -10.42,
        crownZ: lz,
        idx: plan.lotusClusters.length
      });
    }
  }

  return plan;
}

/**
 * Instantiates static `InstancedMesh` batches (`matrixAutoUpdate = false`) for every asset
 * and returns animated crown/reed batches for gentle 60Hz-capped wind sway.
 */
export function populateNightEcosystem(scene: THREE.Scene, night: NightId): SwayBatch[] {
  const cat = createTropicalAssetCatalog(night);
  const plan = generateTropicalPlacementPlan(night);
  const dummy = new THREE.Object3D();
  const swayBatches: SwayBatch[] = [];

  const lambertMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: '#0c231a',
    emissiveIntensity: 0.72,
    flatShading: true
  });

  const addStaticBatch = (geo: THREE.BufferGeometry, items: PlacementItem[]) => {
    if (items.length === 0) {
      geo.dispose();
      return;
    }
    const inst = new THREE.InstancedMesh(geo, lambertMat, items.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, it.yaw, 0);
      dummy.scale.setScalar(it.scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();
    scene.add(inst);
  };

  const addTreeWithSwayCrown = (
    trunkGeo: THREE.BufferGeometry,
    crownGeo: THREE.BufferGeometry,
    items: PlacementItem[],
    amplitude: number
  ) => {
    if (items.length === 0) {
      trunkGeo.dispose();
      crownGeo.dispose();
      return;
    }
    addStaticBatch(trunkGeo, items);
    const crownInst = new THREE.InstancedMesh(crownGeo, lambertMat, items.length);
    const swayItems: SwayBatch['items'] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      dummy.position.set(it.crownX, it.crownY, it.crownZ);
      dummy.rotation.set(0, it.yaw, 0);
      dummy.scale.setScalar(it.scale);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i, dummy.matrix);
      swayItems.push({ x: it.crownX, y: it.crownY, z: it.crownZ, yaw: it.yaw, scale: it.scale, idx: i });
    }
    crownInst.instanceMatrix.needsUpdate = true;
    crownInst.matrixAutoUpdate = false;
    crownInst.updateMatrix();
    scene.add(crownInst);
    swayBatches.push({ inst: crownInst, items: swayItems, amplitude });
  };

  addTreeWithSwayCrown(cat.coconutTrunk, cat.coconutCrown, plan.coconutPalms, 0.045);
  addTreeWithSwayCrown(cat.canopyTrunk, cat.canopyCrown, plan.canopyTrees, 0.025);
  addTreeWithSwayCrown(cat.arecaTrunk, cat.arecaCrown, plan.arecaPalms, 0.055);
  addTreeWithSwayCrown(cat.highlandTrunk, cat.highlandCrown, plan.highlandTrees, 0.038);

  addStaticBatch(cat.bananaClump, plan.bananaClumps);
  addStaticBatch(cat.bambooClump, plan.bambooClumps);
  addStaticBatch(cat.fernClump, plan.ferns);
  addStaticBatch(cat.mossBoulder, plan.boulders);
  addStaticBatch(cat.pebbleCluster, plan.pebbles);
  addStaticBatch(cat.grassSmall, plan.grassSmall);

  // Tall grass reeds get gentle wind sway batching too
  if (plan.grassTall.length > 0) {
    const reedInst = new THREE.InstancedMesh(cat.grassTall, lambertMat, plan.grassTall.length);
    const reedSway: SwayBatch['items'] = [];
    for (let i = 0; i < plan.grassTall.length; i++) {
      const it = plan.grassTall[i];
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, it.yaw, 0);
      dummy.scale.setScalar(it.scale);
      dummy.updateMatrix();
      reedInst.setMatrixAt(i, dummy.matrix);
      reedSway.push({ x: it.x, y: it.y, z: it.z, yaw: it.yaw, scale: it.scale, idx: i });
    }
    reedInst.instanceMatrix.needsUpdate = true;
    reedInst.matrixAutoUpdate = false;
    reedInst.updateMatrix();
    scene.add(reedInst);
    swayBatches.push({ inst: reedInst, items: reedSway, amplitude: 0.08 });
  } else {
    cat.grassTall.dispose();
  }

  addStaticBatch(cat.flowerCluster, plan.flowers);
  addStaticBatch(cat.lotusCluster, plan.lotusClusters);

  return swayBatches;
}
