import * as THREE from 'three';
import { getMapConfig } from '../sim/maps';
import { createRng } from '../sim/rng';
import type { NightId } from '../sim/types';
import { colorizeGeo, mergeParts } from './characterModels';
import { isClearPlayableSpot, sampleIslandElevation } from './terrainBuilder';

export interface TropicalAssetCatalog {
  coconutTrunk: THREE.BufferGeometry;
  coconutCrown: THREE.BufferGeometry;
  canopyTrunk: THREE.BufferGeometry;
  canopyCrown: THREE.BufferGeometry;
  dipterocarpTrunk: THREE.BufferGeometry;
  dipterocarpCrown: THREE.BufferGeometry;
  mangroveArch: THREE.BufferGeometry;
  saplingTree: THREE.BufferGeometry;
  treeFern: THREE.BufferGeometry;
  arecaTrunk: THREE.BufferGeometry;
  arecaCrown: THREE.BufferGeometry;
  highlandTrunk: THREE.BufferGeometry;
  highlandCrown: THREE.BufferGeometry;
  bananaClump: THREE.BufferGeometry;
  bambooClump: THREE.BufferGeometry;
  pandanusShrub: THREE.BufferGeometry;
  mossLog: THREE.BufferGeometry;
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
  dipterocarpTrees: PlacementItem[];
  mangroves: PlacementItem[];
  saplings: PlacementItem[];
  treeFerns: PlacementItem[];
  arecaPalms: PlacementItem[];
  highlandTrees: PlacementItem[];
  bananaClumps: PlacementItem[];
  bambooClumps: PlacementItem[];
  pandanusShrubs: PlacementItem[];
  mossLogs: PlacementItem[];
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
const DIPTEROCARP_CROWN_Y = 4.9;

function buildPalmsCatalog(): Pick<
  TropicalAssetCatalog,
  'coconutTrunk' | 'coconutCrown' | 'arecaTrunk' | 'arecaCrown'
> {
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
  for (let f = 0; f < 8; f++) {
    const fa = (f / 8) * Math.PI * 2;
    const frond = transformGeo(
      new THREE.ConeGeometry(0.32, 2.25, 3),
      [1.02, -0.05 + (f % 2) * 0.08, 0],
      [0, 0, -Math.PI * 0.6],
      [1, 1, 0.5]
    );
    frond.rotateY(fa);
    cocoCrownParts.push(colorizeGeo(frond, f % 2 === 0 ? '#2b6147' : '#357554'));
  }

  const arecaTrunk = mergeParts([
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.10, 0.19, 4.05, 6), [0, 2.02, 0]), '#7d6b52'),
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.125, 0.115, 0.55, 6), [0, 4.25, 0]), '#3b7350')
  ]);
  const arecaCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.14, 1.1, 3), [0, 0.58, 0]), '#489166')
  ];
  for (let f = 0; f < 7; f++) {
    const fa = (f / 7) * Math.PI * 2;
    const frond = transformGeo(
      new THREE.ConeGeometry(0.29, 2.05, 3),
      [0.8, 0.15, 0],
      [0, 0, -Math.PI * 0.37],
      [1, 1, 0.48]
    );
    frond.rotateY(fa);
    arecaCrownParts.push(colorizeGeo(frond, f % 2 === 0 ? '#2f6a4f' : '#3d805f'));
  }

  return {
    coconutTrunk: mergeParts(cocoTrunkParts),
    coconutCrown: mergeParts(cocoCrownParts),
    arecaTrunk,
    arecaCrown: mergeParts(arecaCrownParts)
  };
}

function buildCanopyAndEmergentCatalog(): Pick<
  TropicalAssetCatalog,
  'canopyTrunk' | 'canopyCrown' | 'dipterocarpTrunk' | 'dipterocarpCrown' | 'highlandTrunk' | 'highlandCrown'
> {
  // Ancient Banyan (Cây Đa cổ thụ) with buttresses, boughs & hanging aerial roots
  const canopyTrunkParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.25, 0.40, 2.48, 6), [0, 1.24, 0]), '#573c28'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.22, 1.0, 4), [0.38, 2.55, 0.12], [0, 0, -0.56]), '#4c3422'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.20, 1.0, 4), [-0.36, 2.6, -0.16], [0.22, 0, 0.52]), '#4c3422')
  ];
  for (let r = 0; r < 4; r++) {
    const ra = (r / 4) * Math.PI * 2 + 0.3;
    canopyTrunkParts.push(
      colorizeGeo(
        transformGeo(
          new THREE.ConeGeometry(0.22, 0.95, 3),
          [Math.cos(ra) * 0.38, 0.34, Math.sin(ra) * 0.38],
          [Math.sin(ra) * 0.45, ra, -Math.cos(ra) * 0.45]
        ),
        '#432e1e'
      )
    );
    // Hanging aerial roots (rễ phụ) dropping down from outer canopy boughs
    canopyTrunkParts.push(
      colorizeGeo(
        transformGeo(
          new THREE.CylinderGeometry(0.025, 0.038, 1.85, 3),
          [Math.cos(ra + 0.4) * 1.05, 1.38, Math.sin(ra + 0.4) * 1.05],
          [0.04, 0, -0.04]
        ),
        '#5d432e'
      )
    );
  }
  const canopyCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.5, 0), [0, 0.35, 0], [0, 0.2, 0], [1.32, 0.72, 1.24]), '#1f4a3a'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.18, 0), [-0.9, 0.15, 0.36], [0, 0.6, 0], [1.2, 0.68, 1.12]), '#2a5f49'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.12, 0), [0.88, 0.22, -0.34], [0, 1.1, 0], [1.16, 0.66, 1.12]), '#275945'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.02, 0), [0.05, 0.92, 0.15], [0, 0.4, 0], [1.22, 0.64, 1.16]), '#357458'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.75, 0), [0.15, 0.05, 0.85], [0, 0.8, 0], [1.08, 0.56, 1.02]), '#3e8461')
  ];

  // Tall emergent Rainforest Dipterocarp / Giant Chò Chỉ
  const dipterocarpTrunkParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.17, 0.32, 4.9, 6), [0, 2.45, 0]), '#614631')
  ];
  for (let b = 0; b < 3; b++) {
    const ba = (b / 3) * Math.PI * 2 + 0.2;
    dipterocarpTrunkParts.push(
      colorizeGeo(
        transformGeo(
          new THREE.ConeGeometry(0.28, 1.45, 3),
          [Math.cos(ba) * 0.35, 0.52, Math.sin(ba) * 0.35],
          [Math.sin(ba) * 0.38, ba, -Math.cos(ba) * 0.38]
        ),
        '#4e3726'
      ),
      colorizeGeo(
        transformGeo(
          new THREE.ConeGeometry(0.14, 1.15, 3),
          [Math.cos(ba) * 0.42, 4.65, Math.sin(ba) * 0.42],
          [-Math.sin(ba) * 0.72, ba, Math.cos(ba) * 0.72]
        ),
        '#573e2a'
      )
    );
  }
  const dipterocarpCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.65, 0), [0, 0.18, 0], [0, 0.2, 0], [1.45, 0.52, 1.38]), '#1b4737'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.12, 0), [1.18, 0.08, 0.42], [0, 0.7, 0], [1.18, 0.48, 1.1]), '#266149'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.08, 0), [-1.1, 0.12, -0.46], [0, 1.2, 0], [1.15, 0.46, 1.08]), '#296b4f'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.02, 0), [0.1, 0.2, -1.08], [0, 1.9, 0], [1.1, 0.48, 1.05]), '#2d7354'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.95, 0), [0.08, 0.65, 0.1], [0, 0.5, 0], [1.28, 0.48, 1.22]), '#3c8c62')
  ];

  // Windswept Night 3 Highland Mountain Pine / Pơ-mu
  const highlandTrunk = mergeParts([
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.16, 0.29, 2.85, 6), [0.12, 1.4, 0], [0, 0, -0.09]), '#4a3224'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.14, 0.9, 4), [0.44, 2.35, 0.12], [0.2, 0, -0.65]), '#3d281c'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.12, 0.75, 3), [-0.26, 2.1, -0.14], [-0.15, 0, 0.68]), '#452e20')
  ]);
  const highlandCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.ConeGeometry(1.62, 1.45, 6), [0.15, 0.18, 0], [0, 0, -0.08]), '#1d4036'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(1.24, 1.35, 6), [0.25, 1.08, 0], [0, 0.4, -0.1]), '#255043'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.84, 1.15, 6), [0.34, 1.88, 0], [0, 0.8, -0.12]), '#2f6553'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.46, 0.8, 5), [0.42, 2.52, 0], [0, 1.2, -0.14]), '#3c7a64')
  ];

  return {
    canopyTrunk: mergeParts(canopyTrunkParts),
    canopyCrown: mergeParts(canopyCrownParts),
    dipterocarpTrunk: mergeParts(dipterocarpTrunkParts),
    dipterocarpCrown: mergeParts(dipterocarpCrownParts),
    highlandTrunk,
    highlandCrown: mergeParts(highlandCrownParts)
  };
}

function buildUnderstoryTreesCatalog(): Pick<
  TropicalAssetCatalog,
  'mangroveArch' | 'saplingTree' | 'treeFern' | 'bambooClump'
> {
  // Coastal Mangrove (Cây Đước) with arched stilt prop roots
  const mangroveParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.11, 0.16, 1.85, 5), [0, 1.55, 0]), '#574332')
  ];
  for (let r = 0; r < 5; r++) {
    const ra = (r / 5) * Math.PI * 2;
    mangroveParts.push(
      colorizeGeo(
        transformGeo(
          new THREE.CylinderGeometry(0.036, 0.052, 1.22, 3),
          [Math.cos(ra) * 0.42, 0.56, Math.sin(ra) * 0.42],
          [Math.sin(ra) * 0.52, ra, -Math.cos(ra) * 0.52]
        ),
        r % 2 === 0 ? '#4d3a2b' : '#5e4836'
      )
    );
  }
  mangroveParts.push(
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.95, 0), [0, 2.55, 0], [0, 0.2, 0], [1.22, 0.65, 1.18]), '#235942'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.75, 0), [0.55, 2.35, 0.2], [0, 0.8, 0], [1.1, 0.62, 1.05]), '#2e6e50'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.72, 0), [-0.5, 2.45, -0.22], [0, 1.4, 0], [1.05, 0.62, 1.1]), '#377f5b')
  );

  // Young understory rainforest Sapling (Cây con)
  const saplingParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.045, 0.08, 1.48, 4), [0, 0.74, 0]), '#6e523a'),
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.025, 0.035, 0.58, 3), [0.16, 1.15, 0.05], [0, 0, -0.52]), '#614832'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.54, 0), [0, 1.65, 0], [0, 0.3, 0], [1.1, 0.85, 1.05]), '#367d54'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.42, 0), [0.34, 1.4, 0.12], [0, 0.9, 0], [1.0, 0.8, 1.0]), '#469967'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.38, 0), [-0.28, 1.32, -0.16], [0, 1.5, 0], [1.0, 0.75, 0.95]), '#52ad73')
  ];

  // Ancient Tree Fern (Cây Dương Xỉ Thân Gỗ / Ráng Cổ Thụ)
  const treeFernParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.085, 0.145, 1.65, 5), [0, 0.82, 0]), '#473326'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.15, 0.25, 5), [0, 1.66, 0]), '#3b4a2e')
  ];
  for (let f = 0; f < 7; f++) {
    const fa = (f / 7) * Math.PI * 2;
    const frond = transformGeo(
      new THREE.ConeGeometry(0.25, 1.42, 3),
      [0.62, 1.82, 0],
      [0, 0, -Math.PI * 0.44],
      [0.24, 1, 1.05]
    );
    frond.rotateY(fa);
    treeFernParts.push(colorizeGeo(frond, f % 2 === 0 ? '#2f704e' : '#408f62'));
  }
  for (let f = 0; f < 4; f++) {
    const fa = (f / 4) * Math.PI * 2 + 0.35;
    const inner = transformGeo(
      new THREE.ConeGeometry(0.16, 0.88, 3),
      [0.28, 1.98, 0],
      [0, 0, -0.58],
      [0.25, 1, 1.0]
    );
    inner.rotateY(fa);
    treeFernParts.push(colorizeGeo(inner, '#55ad73'));
  }

  // Tall Graceful Vietnamese Bamboo Grove (Bụi Tre Trúc Cao)
  const bambooParts: THREE.BufferGeometry[] = [];
  const culms: [number, number, number, number][] = [
    [-0.16, -0.1, 0.08, 4.1],
    [0.18, 0.06, -0.11, 4.8],
    [0.02, -0.17, 0.07, 3.7],
    [-0.08, 0.16, -0.06, 4.4],
    [0.10, 0.12, 0.09, 3.4]
  ];
  for (let i = 0; i < culms.length; i++) {
    const [cx, cz, tilt, h] = culms[i];
    bambooParts.push(
      colorizeGeo(
        transformGeo(new THREE.CylinderGeometry(0.042, 0.068, h, 4), [cx, h * 0.5, cz], [tilt, 0, -tilt * 0.85]),
        i % 2 === 0 ? '#3f7848' : '#528f57'
      ),
      colorizeGeo(
        transformGeo(
          new THREE.ConeGeometry(0.56, 1.25, 3),
          [cx - tilt * 0.65, h * 0.94, cz + tilt * 0.65],
          [0, i * 0.85, 0]
        ),
        i % 2 === 0 ? '#2e6340' : '#3a7a4d'
      )
    );
    if (i < 3) {
      bambooParts.push(
        colorizeGeo(
          transformGeo(new THREE.ConeGeometry(0.38, 0.78, 3), [cx - tilt * 0.3, h * 0.68, cz + tilt * 0.3], [0.15, i * 1.1, 0]),
          '#3d8052'
        )
      );
    }
  }

  return {
    mangroveArch: mergeParts(mangroveParts),
    saplingTree: mergeParts(saplingParts),
    treeFern: mergeParts(treeFernParts),
    bambooClump: mergeParts(bambooParts)
  };
}

/**
 * Builds 12+ species of vertex-colored Vietnamese tropical jungle flora, boulders, and island accents.
 */
export function createTropicalAssetCatalog(night: NightId): TropicalAssetCatalog {
  const palms = buildPalmsCatalog();
  const giants = buildCanopyAndEmergentCatalog();
  const midTrees = buildUnderstoryTreesCatalog();

  // Wild Banana Clump (Chuối Rừng) using broad box paddles + crimson flower bud
  const bananaParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.08, 0.28, 4), [0.22, 0.62, 0.14], [Math.PI, 0, 0.3]), '#8c2d4a')
  ];
  for (let b = 0; b < 5; b++) {
    const ba = (b / 5) * Math.PI * 2 + 0.2;
    const stalk = transformGeo(new THREE.CylinderGeometry(0.045, 0.065, 0.82, 3), [0.1, 0.4, 0], [0, 0, -0.26]);
    stalk.rotateY(ba);
    bananaParts.push(colorizeGeo(stalk, '#487a4e'));

    const leaf = transformGeo(
      new THREE.BoxGeometry(1.18, 0.04, 0.46),
      [0.64, 0.82 + (b % 2) * 0.15, 0],
      [0, 0, 0.42]
    );
    leaf.rotateY(ba);
    bananaParts.push(colorizeGeo(leaf, b % 2 === 0 ? '#3e8a5e' : '#53a670'));
  }

  // Coastal Spiky Pandanus / Screw Pine Shrub (Cây Dứa Dại)
  const pandanusParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.10, 0.14, 0.52, 4), [0, 0.25, 0]), '#5c4b39')
  ];
  for (let p = 0; p < 8; p++) {
    const pa = (p / 8) * Math.PI * 2;
    const blade = transformGeo(new THREE.ConeGeometry(0.11, 0.96, 3), [0.34, 0.52, 0], [0, 0, -0.85], [0.28, 1, 1]);
    blade.rotateY(pa);
    pandanusParts.push(colorizeGeo(blade, p % 2 === 0 ? '#347351' : '#4a8f63'));
  }
  for (let p = 0; p < 5; p++) {
    const pa = (p / 5) * Math.PI * 2 + 0.3;
    const inner = transformGeo(new THREE.ConeGeometry(0.08, 0.74, 3), [0.16, 0.64, 0], [0, 0, -0.35], [0.28, 1, 1]);
    inner.rotateY(pa);
    pandanusParts.push(colorizeGeo(inner, '#5ca874'));
  }

  // Fallen Mossy Log with Shelf Mushrooms (Khúc Gỗ Mục Phủ Rêu)
  const mossLog = mergeParts([
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.24, 0.29, 2.55, 5), [0, 0.16, 0], [0, 0, Math.PI * 0.5]), '#4f3827'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.12, 0.62, 4), [0.58, 0.36, 0.14], [0.35, 0, -0.45]), '#453021'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.25, 0), [-0.35, 0.32, 0.04], [0, 0.4, 0], [1.4, 0.42, 0.9]), '#336b4b'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.22, 0), [0.32, 0.3, -0.05], [0, 1.0, 0], [1.2, 0.4, 0.85]), '#448259'),
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.11, 0.08, 0.04, 4), [-0.05, 0.33, 0.22], [0.2, 0, 0]), '#d9c49e'),
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.09, 0.06, 0.04, 4), [0.12, 0.30, 0.24], [0.2, 0.5, 0]), '#e8d8b5')
  ]);

  // Spreading Jungle Ferns (Dương Xỉ Rậm)
  const fernParts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 8; f++) {
    const fa = (f / 8) * Math.PI * 2;
    const frond = transformGeo(
      new THREE.ConeGeometry(0.18, 0.90, 3),
      [0.36, 0.25 + (f % 2) * 0.06, 0],
      [0, 0, -1.02],
      [0.22, 1, 1.05]
    );
    frond.rotateY(fa);
    fernParts.push(colorizeGeo(frond, f % 2 === 0 ? '#2b5e49' : '#3e7d5e'));
  }

  const mossBoulder = mergeParts([
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.62, 0), [0, 0.34, 0], [0.2, 0.4, 0.1], [1.2, 0.78, 1.0]), '#40475c'),
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.38, 0), [0.42, 0.22, 0.25], [0.1, 1.0, 0.3], [1.1, 0.7, 0.9]), '#353c4f'),
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.42, 0), [-0.05, 0.62, 0], [0, 0.2, 0], [1.1, 0.34, 0.95]), '#2e5947')
  ]);
  const pebbleCluster = mergeParts([
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.22, 0), [0, 0.11, 0], [0.1, 0.3, 0], [1.2, 0.65, 0.95]), '#4e556b'),
    colorizeGeo(transformGeo(new THREE.DodecahedronGeometry(0.15, 0), [0.24, 0.08, 0.14], [0.2, 0.8, 0], [1.1, 0.6, 1.0]), '#5c637a')
  ]);

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
      new THREE.ConeGeometry(0.08, 0.9 + (g % 2) * 0.2, 3),
      [Math.cos(ga) * 0.12, 0.43, Math.sin(ga) * 0.12],
      [Math.sin(ga) * 0.28, ga, -Math.cos(ga) * 0.28],
      [0.3, 1, 1]
    );
    tallGrassParts.push(colorizeGeo(reed, g % 2 === 0 ? '#3b7357' : '#4e8a66'));
    if (g < 2) {
      const plume = transformGeo(
        new THREE.ConeGeometry(0.055, 0.26, 3),
        [Math.cos(ga) * 0.24, 0.94, Math.sin(ga) * 0.24],
        [Math.sin(ga) * 0.42, ga, -Math.cos(ga) * 0.42]
      );
      tallGrassParts.push(colorizeGeo(plume, '#cfc49f'));
    }
  }

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

  const lotusParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.65, 0.65, 0.03, 9), [0, 0.015, 0]), '#2c6b4d'),
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 8), [0.75, 0.015, 0.35]), '#367d59'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.24, 0.22, 6), [0.1, 0.12, -0.05], [Math.PI, 0, 0]), '#f08db8'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.15, 0.22, 5), [0.1, 0.16, -0.05], [Math.PI, 0.4, 0]), '#ffeaf3'),
    colorizeGeo(transformGeo(new THREE.OctahedronGeometry(0.06, 0), [0.1, 0.24, -0.05]), '#f2c14e')
  ];

  return {
    ...palms,
    ...giants,
    ...midTrees,
    bananaClump: mergeParts(bananaParts),
    pandanusShrub: mergeParts(pandanusParts),
    mossLog,
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
 * Deterministically builds multi-story clustered rainforest groves & varied-scale flora
 * across all 3 maps while strictly preserving spawn plazas, walkways, lanterns, and motes.
 */
export function generateTropicalPlacementPlan(night: NightId): NightPlacementPlan {
  const rng = createRng(9100 + night * 409);
  const cfg = getMapConfig(night);
  const plan: NightPlacementPlan = {
    coconutPalms: [],
    canopyTrees: [],
    dipterocarpTrees: [],
    mangroves: [],
    saplings: [],
    treeFerns: [],
    arecaPalms: [],
    highlandTrees: [],
    bananaClumps: [],
    bambooClumps: [],
    pandanusShrubs: [],
    mossLogs: [],
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

  const trunkPositions: { x: number; z: number; minDist: number }[] = [];

  const isTooCloseToTrunk = (x: number, z: number, minDist: number): boolean => {
    for (const t of trunkPositions) {
      if (Math.hypot(x - t.x, z - t.z) < Math.max(minDist, t.minDist)) return true;
    }
    return false;
  };

  const isHardSafeSolid = (x: number, y: number, z: number): boolean => {
    if (Math.hypot(x - cfg.spawnPos[0], z - cfg.spawnPos[2]) < 4.75) return false;
    for (const l of cfg.lanterns) {
      if (Math.abs(l.pos[1] - y) < 2 && Math.hypot(x - l.pos[0], z - l.pos[2]) < 3.45) return false;
    }
    for (const m of cfg.moteSpawnPoints) {
      if (Math.abs(m[1] - y) < 1.5 && Math.hypot(x - m[0], z - m[2]) < 1.55) return false;
    }
    return true;
  };

  const pushItem = (
    target: PlacementItem[],
    cx: number,
    radius: number,
    x: number,
    z: number,
    yaw: number,
    scale: number,
    crownOffset: [number, number, number],
    solidSpacing = 0
  ) => {
    const y = sampleIslandElevation(night, cx, radius, x, z);
    if (solidSpacing > 0 && !isHardSafeSolid(x, y, z)) return false;
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
    if (solidSpacing > 0) trunkPositions.push({ x, z, minDist: solidSpacing });
    return true;
  };

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
    orientOutward = false,
    solidSpacing = 0
  ) => {
    let attempts = 0;
    let added = 0;
    while (added < count && attempts < count * 36) {
      attempts++;
      const angle = rng() * Math.PI * 2;
      const dist = radius * (rMinRatio + rng() * (rMaxRatio - rMinRatio));
      const x = cx + Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (!isClearPlayableSpot(night, cx, radius, x, z, clearanceMargin)) continue;
      if (solidSpacing > 0 && isTooCloseToTrunk(x, z, solidSpacing)) continue;
      const scale = scaleMin + rng() * (scaleMax - scaleMin);
      const yaw = orientOutward ? -angle : rng() * Math.PI * 2;
      if (pushItem(target, cx, radius, x, z, yaw, scale, crownOffset, solidSpacing)) added++;
    }
  };

  // Cluster understory flora (saplings, ferns, bananas, shrubs, grass, flowers) naturally around big tree anchors
  const clusterAroundAnchor = (
    anchor: PlacementItem,
    cx: number,
    radius: number,
    target: PlacementItem[],
    count: number,
    minR: number,
    maxR: number,
    clearanceMargin: number,
    scaleMin: number,
    scaleMax: number,
    solidSpacing = 0
  ) => {
    let attempts = 0;
    let added = 0;
    while (added < count && attempts < count * 10) {
      attempts++;
      const a = rng() * Math.PI * 2;
      const d = minR + rng() * (maxR - minR);
      const x = anchor.x + Math.cos(a) * d;
      const z = anchor.z + Math.sin(a) * d;
      if (Math.hypot(x - cx, z) > radius - 1.0) continue;
      if (!isClearPlayableSpot(night, cx, radius, x, z, clearanceMargin)) continue;
      if (solidSpacing > 0 && isTooCloseToTrunk(x, z, solidSpacing)) continue;
      const scale = scaleMin + rng() * (scaleMax - scaleMin);
      if (pushItem(target, cx, radius, x, z, rng() * Math.PI * 2, scale, [0, 0, 0], solidSpacing)) added++;
    }
  };

  for (const { cx, r } of discs) {
    if (night === 1) {
      tryPlace(plan.dipterocarpTrees, 20, cx, r, 0.38, 0.88, 0.85, 1.05, 1.82, [0, DIPTEROCARP_CROWN_Y, 0], false, 2.2);
      tryPlace(plan.canopyTrees, 22, cx, r, 0.34, 0.90, 0.85, 0.84, 1.54, [0, 2.5, 0], false, 2.0);
      tryPlace(plan.coconutPalms, 24, cx, r, 0.65, 0.94, 0.72, 0.82, 1.48, [COCONUT_TIP_X, COCONUT_TIP_Y, 0], true, 1.6);
      tryPlace(plan.mangroves, 14, cx, r, 0.78, 0.94, 0.45, 0.85, 1.38, [0, 0, 0], false, 1.5);
      tryPlace(plan.arecaPalms, 10, cx, r, 0.36, 0.85, 0.75, 0.82, 1.35, [0, 4.4, 0], false, 1.4);
      tryPlace(plan.bambooClumps, 20, cx, r, 0.44, 0.93, 0.35, 0.82, 1.42, [0, 0, 0], false, 1.2);
      tryPlace(plan.treeFerns, 14, cx, r, 0.28, 0.92, 0.25, 0.78, 1.38, [0, 0, 0], false, 1.0);
      tryPlace(plan.saplings, 18, cx, r, 0.18, 0.93, 0.20, 0.52, 0.88, [0, 0, 0], false, 0.9);

      // Build dense multi-story grove clusters under big tree trunks
      const groveAnchors = [...plan.dipterocarpTrees, ...plan.canopyTrees];
      for (const a of groveAnchors) {
        clusterAroundAnchor(a, cx, r, plan.saplings, 1, 1.6, 3.8, 0.2, 0.52, 0.84, 0.85);
        clusterAroundAnchor(a, cx, r, plan.treeFerns, 1, 1.4, 3.4, 0.15, 0.82, 1.32, 0.85);
        clusterAroundAnchor(a, cx, r, plan.ferns, 2, 1.0, 3.5, -0.35, 0.8, 1.45);
        clusterAroundAnchor(a, cx, r, plan.grassSmall, 2, 0.9, 3.8, -0.55, 0.85, 1.45);
      }

      tryPlace(plan.bananaClumps, 30, cx, r, 0.24, 0.92, 0.15, 0.78, 1.35);
      tryPlace(plan.pandanusShrubs, 28, cx, r, 0.48, 0.94, 0.1, 0.72, 1.38);
      tryPlace(plan.mossLogs, 16, cx, r, 0.28, 0.91, 0.2, 0.85, 1.35);
      tryPlace(plan.ferns, 50, cx, r, 0.16, 0.94, -0.35, 0.8, 1.45);
      tryPlace(plan.boulders, 32, cx, r, 0.22, 0.94, 0.65, 0.68, 1.62, [0, 0, 0], false, 1.3);
      tryPlace(plan.pebbles, 65, cx, r, 0.14, 0.95, -0.5, 0.7, 1.45);
      tryPlace(plan.grassSmall, 185, cx, r, 0.14, 0.95, -0.65, 0.75, 1.5);
      tryPlace(plan.grassTall, 96, cx, r, 0.24, 0.95, -0.35, 0.8, 1.45);
      tryPlace(plan.flowers, 82, cx, r, 0.14, 0.93, -0.55, 0.8, 1.4);
    } else if (night === 2) {
      tryPlace(plan.arecaPalms, 17, cx, r, 0.42, 0.92, 0.68, 0.85, 1.45, [0, 4.4, 0], false, 1.35);
      tryPlace(plan.dipterocarpTrees, 8, cx, r, 0.48, 0.88, 0.82, 1.0, 1.68, [0, DIPTEROCARP_CROWN_Y, 0], false, 2.0);
      tryPlace(plan.canopyTrees, 9, cx, r, 0.42, 0.88, 0.82, 0.82, 1.42, [0, 2.48, 0], false, 1.85);
      tryPlace(plan.coconutPalms, 7, cx, r, 0.66, 0.93, 0.68, 0.82, 1.36, [COCONUT_TIP_X, COCONUT_TIP_Y, 0], true, 1.5);
      tryPlace(plan.mangroves, 7, cx, r, 0.74, 0.94, 0.4, 0.85, 1.35, [0, 0, 0], false, 1.4);
      tryPlace(plan.bambooClumps, 9, cx, r, 0.45, 0.93, 0.35, 0.82, 1.38, [0, 0, 0], false, 1.1);
      tryPlace(plan.treeFerns, 8, cx, r, 0.30, 0.92, 0.2, 0.78, 1.35, [0, 0, 0], false, 0.9);
      tryPlace(plan.saplings, 8, cx, r, 0.25, 0.92, 0.15, 0.52, 0.86, [0, 0, 0], false, 0.85);

      const discAnchors = [...plan.canopyTrees, ...plan.dipterocarpTrees].filter((a) => Math.hypot(a.x - cx, a.z) <= r + 1);
      for (const a of discAnchors) {
        clusterAroundAnchor(a, cx, r, plan.saplings, 1, 1.4, 3.2, 0.15, 0.52, 0.82, 0.8);
        clusterAroundAnchor(a, cx, r, plan.ferns, 2, 1.0, 3.0, -0.35, 0.8, 1.35);
      }

      tryPlace(plan.bananaClumps, 14, cx, r, 0.28, 0.92, 0.15, 0.8, 1.3);
      tryPlace(plan.pandanusShrubs, 12, cx, r, 0.54, 0.94, 0.1, 0.75, 1.32);
      tryPlace(plan.mossLogs, 7, cx, r, 0.32, 0.90, 0.2, 0.82, 1.28);
      tryPlace(plan.ferns, 22, cx, r, 0.20, 0.93, -0.4, 0.8, 1.35);
      tryPlace(plan.boulders, 15, cx, r, 0.32, 0.94, 0.65, 0.68, 1.48, [0, 0, 0], false, 1.2);
      tryPlace(plan.pebbles, 26, cx, r, 0.16, 0.95, -0.5, 0.72, 1.35);
      tryPlace(plan.grassSmall, 85, cx, r, 0.15, 0.94, -0.65, 0.78, 1.45);
      tryPlace(plan.grassTall, 38, cx, r, 0.34, 0.95, -0.4, 0.8, 1.38);
      tryPlace(plan.flowers, 32, cx, r, 0.16, 0.93, -0.55, 0.8, 1.35);
    } else {
      tryPlace(plan.highlandTrees, 28, cx, r, 0.60, 0.94, 0.82, 0.88, 1.62, [0.16, 2.6, 0], false, 1.95);
      tryPlace(plan.dipterocarpTrees, 16, cx, r, 0.62, 0.92, 0.85, 1.05, 1.85, [0, DIPTEROCARP_CROWN_Y, 0], false, 2.2);
      tryPlace(plan.canopyTrees, 16, cx, r, 0.60, 0.91, 0.85, 0.84, 1.48, [0, 2.5, 0], false, 1.95);
      tryPlace(plan.bambooClumps, 20, cx, r, 0.60, 0.94, 0.35, 0.85, 1.45, [0, 0, 0], false, 1.15);
      tryPlace(plan.treeFerns, 16, cx, r, 0.59, 0.93, 0.2, 0.80, 1.38, [0, 0, 0], false, 0.95);
      tryPlace(plan.saplings, 18, cx, r, 0.59, 0.94, 0.15, 0.52, 0.88, [0, 0, 0], false, 0.85);

      const n3Anchors = [...plan.highlandTrees, ...plan.dipterocarpTrees];
      for (const a of n3Anchors) {
        clusterAroundAnchor(a, cx, r, plan.saplings, 1, 1.5, 3.6, 0.15, 0.52, 0.84, 0.85);
        clusterAroundAnchor(a, cx, r, plan.ferns, 1, 1.1, 3.2, -0.35, 0.85, 1.35);
      }

      tryPlace(plan.bananaClumps, 20, cx, r, 0.58, 0.92, 0.15, 0.8, 1.32);
      tryPlace(plan.pandanusShrubs, 22, cx, r, 0.60, 0.94, 0.1, 0.75, 1.35);
      tryPlace(plan.mossLogs, 14, cx, r, 0.59, 0.92, 0.2, 0.85, 1.35);
      tryPlace(plan.ferns, 36, cx, r, 0.58, 0.94, -0.4, 0.82, 1.4);
      tryPlace(plan.boulders, 32, cx, r, 0.56, 0.95, 0.65, 0.72, 1.68, [0, 0, 0], false, 1.3);
      tryPlace(plan.pebbles, 46, cx, r, 0.52, 0.95, -0.5, 0.72, 1.38);
      tryPlace(plan.grassSmall, 145, cx, r, 0.54, 0.95, -0.65, 0.78, 1.48);
      tryPlace(plan.grassTall, 68, cx, r, 0.59, 0.96, -0.4, 0.82, 1.4);
      tryPlace(plan.flowers, 46, cx, r, 0.55, 0.93, -0.55, 0.82, 1.35);
    }
  }

  // Night 3 elevated sanctuary decor (Tier 1 Y=3 & Tier 2 Y=6 avoiding ramps/lamps/bell/motes)
  if (night === 3) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 0.84 + 0.25;
      const r = i % 2 === 0 ? 22.2 : 14.2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const nearMote = cfg.moteSpawnPoints.some((m) => Math.hypot(m[0] - x, m[2] - z) < 1.8);
      const nearLamp = cfg.lanterns.some((l) => Math.hypot(l.pos[0] - x, l.pos[2] - z) < 3.4);
      if (nearMote || nearLamp || Math.hypot(x, z - 13) < 2.6) continue;
      plan.ferns.push({ x, y: 3.0, z, yaw: a, scale: 1.0, crownX: x, crownY: 3.0, crownZ: z, idx: plan.ferns.length });
      if (i % 2 === 0) {
        plan.flowers.push({ x: x + 0.5, y: 3.0, z: z - 0.3, yaw: -a, scale: 1.0, crownX: x, crownY: 3.0, crownZ: z, idx: plan.flowers.length });
      }
      if (i % 3 === 0) {
        plan.pebbles.push({ x: x - 0.4, y: 3.0, z: z + 0.4, yaw: a * 2, scale: 0.95, crownX: x, crownY: 3.0, crownZ: z, idx: plan.pebbles.length });
      }
    }
  }

  // Night 2 floating lotus lagoon clusters flanking the bridge channel at water Y = -10.42
  if (night === 2) {
    for (let i = 0; i < 32; i++) {
      const lx = 18 + rng() * 34;
      const side = i % 2 === 0 ? 1 : -1;
      const lz = side * (3.6 + rng() * 17);
      plan.lotusClusters.push({
        x: lx,
        y: -10.42,
        z: lz,
        yaw: rng() * Math.PI * 2,
        scale: 0.92 + rng() * 0.82,
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
 * Instantiates static `InstancedMesh` batches (`matrixAutoUpdate = false`) for all 12+ species
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
    emissiveIntensity: 0.58,
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
  addTreeWithSwayCrown(cat.canopyTrunk, cat.canopyCrown, plan.canopyTrees, 0.024);
  addTreeWithSwayCrown(cat.dipterocarpTrunk, cat.dipterocarpCrown, plan.dipterocarpTrees, 0.022);
  addTreeWithSwayCrown(cat.arecaTrunk, cat.arecaCrown, plan.arecaPalms, 0.052);
  addTreeWithSwayCrown(cat.highlandTrunk, cat.highlandCrown, plan.highlandTrees, 0.036);

  addStaticBatch(cat.mangroveArch, plan.mangroves);
  addStaticBatch(cat.saplingTree, plan.saplings);
  addStaticBatch(cat.treeFern, plan.treeFerns);
  addStaticBatch(cat.bananaClump, plan.bananaClumps);
  addStaticBatch(cat.bambooClump, plan.bambooClumps);
  addStaticBatch(cat.pandanusShrub, plan.pandanusShrubs);
  addStaticBatch(cat.mossLog, plan.mossLogs);
  addStaticBatch(cat.fernClump, plan.ferns);
  addStaticBatch(cat.mossBoulder, plan.boulders);
  addStaticBatch(cat.pebbleCluster, plan.pebbles);
  addStaticBatch(cat.grassSmall, plan.grassSmall);

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
    swayBatches.push({ inst: reedInst, items: reedSway, amplitude: 0.075 });
  } else {
    cat.grassTall.dispose();
  }

  addStaticBatch(cat.flowerCluster, plan.flowers);
  addStaticBatch(cat.lotusCluster, plan.lotusClusters);

  return swayBatches;
}
