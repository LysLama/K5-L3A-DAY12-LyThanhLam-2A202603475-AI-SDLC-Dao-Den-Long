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
  items: { x: number; y: number; z: number; yaw: number; scale: number; idx: number; vis: number }[];
  amplitude: number;
  /** Tree crowns that shrink away while they hide the player from the chase camera. */
  occlude?: boolean;
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
        i % 2 === 0 ? '#b8946a' : '#c9a67a'
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
        c === 0 ? '#7a5a2c' : '#587032'
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
    cocoCrownParts.push(colorizeGeo(frond, f % 2 === 0 ? '#4fa83a' : '#6cc04a'));
  }

  const arecaTrunk = mergeParts([
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.10, 0.19, 4.05, 6), [0, 2.02, 0]), '#c2b79a'),
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.125, 0.115, 0.55, 6), [0, 4.25, 0]), '#3b7350')
  ]);
  const arecaCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.14, 1.1, 3), [0, 0.58, 0]), '#93d868')
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
    arecaCrownParts.push(colorizeGeo(frond, f % 2 === 0 ? '#58b043' : '#78c957'));
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
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.25, 0.40, 2.48, 6), [0, 1.24, 0]), '#8c6340'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.22, 1.0, 4), [0.38, 2.55, 0.12], [0, 0, -0.56]), '#7a5636'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.20, 1.0, 4), [-0.36, 2.6, -0.16], [0.22, 0, 0.52]), '#7a5636')
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
        '#6f4c30'
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
        '#a07a52'
      )
    );
  }
  const canopyCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.5, 0), [0, 0.35, 0], [0, 0.2, 0], [1.32, 0.72, 1.24]), '#3d7a34'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.18, 0), [-0.9, 0.15, 0.36], [0, 0.6, 0], [1.2, 0.68, 1.12]), '#4f9440'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.12, 0), [0.88, 0.22, -0.34], [0, 1.1, 0], [1.16, 0.66, 1.12]), '#468a3a'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.02, 0), [0.05, 0.92, 0.15], [0, 0.4, 0], [1.22, 0.64, 1.16]), '#69a846'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.75, 0), [0.15, 0.05, 0.85], [0, 0.8, 0], [1.08, 0.56, 1.02]), '#86bd52')
  ];

  // Tall emergent Rainforest Dipterocarp / Giant Chò Chỉ
  const dipterocarpTrunkParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.17, 0.32, 4.9, 6), [0, 2.45, 0]), '#a89478')
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
        '#8a7860'
      ),
      colorizeGeo(
        transformGeo(
          new THREE.ConeGeometry(0.14, 1.15, 3),
          [Math.cos(ba) * 0.42, 4.65, Math.sin(ba) * 0.42],
          [-Math.sin(ba) * 0.72, ba, Math.cos(ba) * 0.72]
        ),
        '#97836a'
      )
    );
  }
  const dipterocarpCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.65, 0), [0, 0.18, 0], [0, 0.2, 0], [1.45, 0.52, 1.38]), '#1f6e4c'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.12, 0), [1.18, 0.08, 0.42], [0, 0.7, 0], [1.18, 0.48, 1.1]), '#2a8460'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.08, 0), [-1.1, 0.12, -0.46], [0, 1.2, 0], [1.15, 0.46, 1.08]), '#2f9468'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(1.02, 0), [0.1, 0.2, -1.08], [0, 1.9, 0], [1.1, 0.48, 1.05]), '#38a373'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.95, 0), [0.08, 0.65, 0.1], [0, 0.5, 0], [1.28, 0.48, 1.22]), '#4dba84')
  ];

  // Windswept Night 3 Highland Mountain Pine / Pơ-mu
  const highlandTrunk = mergeParts([
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.16, 0.29, 2.85, 6), [0.12, 1.4, 0], [0, 0, -0.09]), '#86493a'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.14, 0.9, 4), [0.44, 2.35, 0.12], [0.2, 0, -0.65]), '#6e3b2e'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.12, 0.75, 3), [-0.26, 2.1, -0.14], [-0.15, 0, 0.68]), '#7c4636')
  ]);
  const highlandCrownParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.ConeGeometry(1.62, 1.45, 6), [0.15, 0.18, 0], [0, 0, -0.08]), '#2a6a5a'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(1.24, 1.35, 6), [0.25, 1.08, 0], [0, 0.4, -0.1]), '#318070'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.84, 1.15, 6), [0.34, 1.88, 0], [0, 0.8, -0.12]), '#3d9482'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.46, 0.8, 5), [0.42, 2.52, 0], [0, 1.2, -0.14]), '#52ab96')
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
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.11, 0.16, 1.85, 5), [0, 1.55, 0]), '#8a5a40')
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
        r % 2 === 0 ? '#7a4d36' : '#96654a'
      )
    );
  }
  mangroveParts.push(
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.95, 0), [0, 2.55, 0], [0, 0.2, 0], [1.22, 0.65, 1.18]), '#56913a'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.75, 0), [0.55, 2.35, 0.2], [0, 0.8, 0], [1.1, 0.62, 1.05]), '#6fa842'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.72, 0), [-0.5, 2.45, -0.22], [0, 1.4, 0], [1.05, 0.62, 1.1]), '#88bd4c')
  );

  // Young understory rainforest Sapling (Cây con)
  const saplingParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.045, 0.08, 1.48, 4), [0, 0.74, 0]), '#9c7650'),
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.025, 0.035, 0.58, 3), [0.16, 1.15, 0.05], [0, 0, -0.52]), '#8a6642'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.54, 0), [0, 1.65, 0], [0, 0.3, 0], [1.1, 0.85, 1.05]), '#5fb049'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.42, 0), [0.34, 1.4, 0.12], [0, 0.9, 0], [1.0, 0.8, 1.0]), '#74c455'),
    colorizeGeo(transformGeo(new THREE.IcosahedronGeometry(0.38, 0), [-0.28, 1.32, -0.16], [0, 1.5, 0], [1.0, 0.75, 0.95]), '#8ad862')
  ];

  // Ancient Tree Fern (Cây Dương Xỉ Thân Gỗ / Ráng Cổ Thụ)
  const treeFernParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.085, 0.145, 1.65, 5), [0, 0.82, 0]), '#6b4a35'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.15, 0.25, 5), [0, 1.66, 0]), '#7d7a3a')
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
    treeFernParts.push(colorizeGeo(frond, f % 2 === 0 ? '#3f9a4a' : '#5cb85a'));
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
    treeFernParts.push(colorizeGeo(inner, '#7ed06a'));
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
        i % 2 === 0 ? '#b5c25e' : '#9fb84e'
      ),
      colorizeGeo(
        transformGeo(
          new THREE.ConeGeometry(0.56, 1.25, 3),
          [cx - tilt * 0.65, h * 0.94, cz + tilt * 0.65],
          [0, i * 0.85, 0]
        ),
        i % 2 === 0 ? '#3e8a45' : '#58a94e'
      )
    );
    if (i < 3) {
      bambooParts.push(
        colorizeGeo(
          transformGeo(new THREE.ConeGeometry(0.38, 0.78, 3), [cx - tilt * 0.3, h * 0.68, cz + tilt * 0.3], [0.15, i * 1.1, 0]),
          '#6dba58'
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
    bananaParts.push(colorizeGeo(stalk, '#8aa850'));

    const leaf = transformGeo(
      new THREE.BoxGeometry(1.18, 0.04, 0.46),
      [0.64, 0.82 + (b % 2) * 0.15, 0],
      [0, 0, 0.42]
    );
    leaf.rotateY(ba);
    bananaParts.push(colorizeGeo(leaf, b % 2 === 0 ? '#4aa84a' : '#72c25a'));
  }

  // Coastal Spiky Pandanus / Screw Pine Shrub (Cây Dứa Dại)
  const pandanusParts: THREE.BufferGeometry[] = [
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.10, 0.14, 0.52, 4), [0, 0.25, 0]), '#8f7552')
  ];
  for (let p = 0; p < 8; p++) {
    const pa = (p / 8) * Math.PI * 2;
    const blade = transformGeo(new THREE.ConeGeometry(0.11, 0.96, 3), [0.34, 0.52, 0], [0, 0, -0.85], [0.28, 1, 1]);
    blade.rotateY(pa);
    pandanusParts.push(colorizeGeo(blade, p % 2 === 0 ? '#3c9348' : '#62ad54'));
  }
  for (let p = 0; p < 5; p++) {
    const pa = (p / 5) * Math.PI * 2 + 0.3;
    const inner = transformGeo(new THREE.ConeGeometry(0.08, 0.74, 3), [0.16, 0.64, 0], [0, 0, -0.35], [0.28, 1, 1]);
    inner.rotateY(pa);
    pandanusParts.push(colorizeGeo(inner, '#86c765'));
  }

  // Fallen Mossy Log with Shelf Mushrooms (Khúc Gỗ Mục Phủ Rêu)
  const mossLog = mergeParts([
    colorizeGeo(transformGeo(new THREE.CylinderGeometry(0.24, 0.29, 2.55, 5), [0, 0.16, 0], [0, 0, Math.PI * 0.5]), '#77563a'),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.12, 0.62, 4), [0.58, 0.36, 0.14], [0.35, 0, -0.45]), '#654630'),
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
    fernParts.push(colorizeGeo(frond, f % 2 === 0 ? '#3b8a44' : '#5aaa52'));
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
    smallGrassParts.push(colorizeGeo(blade, g % 2 === 0 ? '#4c9a46' : '#6ab458'));
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
    tallGrassParts.push(colorizeGeo(reed, g % 2 === 0 ? '#5a9e48' : '#78b858'));
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
    solidSpacing = 0,
    yOverride?: number
  ) => {
    const y = yOverride ?? sampleIslandElevation(night, cx, radius, x, z);
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

  type Spec = [
    keyof NightPlacementPlan,
    number,
    number,
    number,
    number,
    number,
    number,
    [number, number, number]?,
    boolean?,
    number?
  ];
  const DIP: [number, number, number] = [0, DIPTEROCARP_CROWN_Y, 0];
  const CAN: [number, number, number] = [0, 2.5, 0];
  const COC: [number, number, number] = [COCONUT_TIP_X, COCONUT_TIP_Y, 0];
  const ARE: [number, number, number] = [0, 4.4, 0];
  const HIG: [number, number, number] = [0.16, 2.6, 0];

  // [layer, count, rMin, rMax, clearanceMargin, scaleMin, scaleMax, crownOffset, outward, trunkSpacing]
  const treeSpecs: Spec[] =
    night === 1
      ? [
          ['dipterocarpTrees', 52, 0.34, 0.9, 0.35, 1.0, 1.9, DIP, false, 1.7],
          ['canopyTrees', 58, 0.3, 0.92, 0.35, 0.8, 1.6, CAN, false, 1.5],
          ['coconutPalms', 40, 0.6, 0.95, 0.3, 0.8, 1.5, COC, true, 1.2],
          ['mangroves', 34, 0.74, 0.96, 0.1, 0.85, 1.45, undefined, false, 1.1],
          ['arecaPalms', 30, 0.32, 0.88, 0.35, 0.8, 1.45, ARE, false, 1.0],
          ['bambooClumps', 62, 0.36, 0.95, -0.1, 0.8, 1.55, undefined, false, 0.9],
          ['treeFerns', 52, 0.22, 0.94, -0.3, 0.75, 1.45, undefined, false, 0.8],
          ['saplings', 84, 0.18, 0.95, -0.4, 0.5, 0.95, undefined, false, 0.65]
        ]
      : night === 2
        ? [
            ['arecaPalms', 28, 0.4, 0.92, 0.3, 0.85, 1.5, ARE, false, 1.0],
            ['dipterocarpTrees', 16, 0.44, 0.9, 0.3, 1.0, 1.75, DIP, false, 1.6],
            ['canopyTrees', 20, 0.4, 0.9, 0.3, 0.8, 1.5, CAN, false, 1.4],
            ['coconutPalms', 14, 0.64, 0.94, 0.3, 0.8, 1.4, COC, true, 1.2],
            ['mangroves', 14, 0.72, 0.96, 0.1, 0.85, 1.4, undefined, false, 1.1],
            ['bambooClumps', 26, 0.4, 0.94, -0.1, 0.8, 1.5, undefined, false, 0.9],
            ['treeFerns', 22, 0.24, 0.93, -0.3, 0.75, 1.4, undefined, false, 0.8],
            ['saplings', 34, 0.2, 0.94, -0.4, 0.5, 0.92, undefined, false, 0.65]
          ]
        : [
            ['highlandTrees', 64, 0.58, 0.95, 0.3, 0.88, 1.7, HIG, false, 1.5],
            ['dipterocarpTrees', 34, 0.58, 0.93, 0.35, 1.0, 1.9, DIP, false, 1.7],
            ['canopyTrees', 36, 0.58, 0.92, 0.35, 0.8, 1.55, CAN, false, 1.5],
            ['bambooClumps', 44, 0.58, 0.95, -0.1, 0.85, 1.55, undefined, false, 0.9],
            ['treeFerns', 34, 0.58, 0.94, -0.3, 0.78, 1.45, undefined, false, 0.8],
            ['saplings', 56, 0.58, 0.95, -0.4, 0.5, 0.95, undefined, false, 0.65]
          ];
  const underSpecs: Spec[] =
    night === 1
      ? [
          ['bananaClumps', 70, 0.22, 0.93, -0.3, 0.78, 1.4],
          ['pandanusShrubs', 60, 0.45, 0.95, -0.4, 0.72, 1.4],
          ['mossLogs', 36, 0.28, 0.92, -0.2, 0.85, 1.4],
          ['ferns', 150, 0.14, 0.95, -0.9, 0.8, 1.5],
          ['boulders', 56, 0.22, 0.95, 0.3, 0.68, 1.7, undefined, false, 1.2],
          ['pebbles', 100, 0.14, 0.95, -0.6, 0.7, 1.5],
          ['grassSmall', 340, 0.14, 0.95, -1.3, 0.75, 1.55],
          ['grassTall', 170, 0.24, 0.95, -0.9, 0.8, 1.5],
          ['flowers', 130, 0.14, 0.94, -0.8, 0.8, 1.45]
        ]
      : night === 2
        ? [
            ['bananaClumps', 30, 0.22, 0.93, -0.3, 0.8, 1.35],
            ['pandanusShrubs', 26, 0.45, 0.95, -0.4, 0.75, 1.35],
            ['mossLogs', 14, 0.28, 0.91, -0.2, 0.82, 1.3],
            ['ferns', 62, 0.14, 0.94, -0.9, 0.8, 1.4],
            ['boulders', 24, 0.24, 0.95, 0.3, 0.68, 1.55, undefined, false, 1.2],
            ['pebbles', 44, 0.14, 0.95, -0.6, 0.72, 1.4],
            ['grassSmall', 150, 0.14, 0.95, -1.3, 0.78, 1.5],
            ['grassTall', 76, 0.26, 0.95, -0.9, 0.8, 1.45],
            ['flowers', 58, 0.14, 0.94, -0.8, 0.8, 1.4]
          ]
        : [
            ['bananaClumps', 36, 0.58, 0.93, -0.3, 0.8, 1.35],
            ['pandanusShrubs', 40, 0.58, 0.95, -0.4, 0.75, 1.4],
            ['mossLogs', 26, 0.58, 0.93, -0.2, 0.85, 1.4],
            ['ferns', 84, 0.58, 0.95, -0.9, 0.82, 1.45],
            ['boulders', 48, 0.58, 0.96, 0.3, 0.72, 1.75, undefined, false, 1.2],
            ['pebbles', 76, 0.58, 0.96, -0.6, 0.72, 1.4],
            ['grassSmall', 250, 0.58, 0.96, -1.3, 0.78, 1.5],
            ['grassTall', 120, 0.58, 0.96, -0.9, 0.82, 1.45],
            ['flowers', 90, 0.58, 0.95, -0.8, 0.82, 1.4]
          ];

  const runSpec = (spec: Spec, cx: number, r: number) => {
    const [layer, count, rMin, rMax, margin, sMin, sMax, crown, outward, spacing] = spec;
    tryPlace(plan[layer], count, cx, r, rMin, rMax, margin, sMin, sMax, crown ?? [0, 0, 0], outward ?? false, spacing ?? 0);
  };

  for (const { cx, r } of discs) {
    for (const spec of treeSpecs) runSpec(spec, cx, r);

    // Multi-story grove: saplings, tree ferns, ferns and grass crowd in under every big tree
    const anchors = [...plan.dipterocarpTrees, ...plan.canopyTrees, ...plan.highlandTrees].filter(
      (a) => Math.hypot(a.x - cx, a.z) <= r + 1
    );
    for (const a of anchors) {
      clusterAroundAnchor(a, cx, r, plan.saplings, 2, 1.3, 3.8, -0.3, 0.5, 0.88, 0.6);
      clusterAroundAnchor(a, cx, r, plan.treeFerns, 1, 1.2, 3.4, -0.2, 0.8, 1.35, 0.7);
      clusterAroundAnchor(a, cx, r, plan.bananaClumps, 1, 1.4, 3.6, -0.3, 0.8, 1.3);
      clusterAroundAnchor(a, cx, r, plan.ferns, 3, 0.9, 3.5, -0.9, 0.8, 1.45);
      clusterAroundAnchor(a, cx, r, plan.grassSmall, 3, 0.8, 3.8, -1.3, 0.85, 1.5);
    }

    for (const spec of underSpecs) runSpec(spec, cx, r);
  }

  // Night 3 elevated sanctuary terraces: Tier 1 (Y=3, r 12..24, z>0) and Tier 2 (Y=6, r<=8)
  if (night === 3) {
    const RAMP_DIRS = [(30 * Math.PI) / 180, (150 * Math.PI) / 180];
    const tierOk = (tier: 1 | 2, x: number, z: number, y: number): boolean => {
      const rr = Math.hypot(x, z);
      if (tier === 1) {
        if (rr < 13.0 || rr > 22.8 || z < 1.2) return false;
        // keep jump-pad approach lane and the ramp entrances readable
        if (Math.abs(x) < 3.2 && z > 6 && z < 16.5) return false;
        for (const rad of RAMP_DIRS) {
          const ux = Math.cos(rad);
          const uz = Math.sin(rad);
          const s = x * ux + z * uz;
          const lat = Math.abs(-x * uz + z * ux);
          if (s > 12 && lat < 3.0) return false;
        }
      } else {
        if (rr < 3.3 || rr > 7.0) return false;
        // jump-pad landing lane toward lantern L1 (0,6,6)
        if (Math.abs(x) < 3.0 && z > 1.5) return false;
      }
      for (const l of cfg.lanterns) {
        if (Math.abs(l.pos[1] - y) < 1.5 && Math.hypot(x - l.pos[0], z - l.pos[2]) < 2.3) return false;
      }
      for (const m of cfg.moteSpawnPoints) {
        if (Math.abs(m[1] - y) < 1.5 && Math.hypot(x - m[0], z - m[2]) < 0.9) return false;
      }
      return true;
    };
    const placeTier = (
      tier: 1 | 2,
      layer: keyof NightPlacementPlan,
      count: number,
      sMin: number,
      sMax: number,
      crown: [number, number, number] = [0, 0, 0],
      spacing = 0
    ) => {
      const y = tier === 1 ? 3.0 : 6.0;
      const target = plan[layer];
      let attempts = 0;
      let added = 0;
      while (added < count && attempts < count * 60) {
        attempts++;
        const rr = tier === 1 ? 13.0 + rng() * 9.8 : 3.3 + rng() * 3.7;
        const ang = tier === 1 ? 0.04 + rng() * (Math.PI - 0.08) : rng() * Math.PI * 2;
        const x = Math.cos(ang) * rr;
        const z = Math.sin(ang) * rr;
        if (!tierOk(tier, x, z, y)) continue;
        if (spacing > 0 && isTooCloseToTrunk(x, z, spacing)) continue;
        const scale = sMin + rng() * (sMax - sMin);
        if (pushItem(target, 0, 45, x, z, rng() * Math.PI * 2, scale, crown, spacing, y)) added++;
      }
    };

    // Tier 1 forest terrace
    placeTier(1, 'highlandTrees', 16, 0.85, 1.3, HIG, 1.5);
    placeTier(1, 'canopyTrees', 16, 0.8, 1.3, CAN, 1.5);
    placeTier(1, 'dipterocarpTrees', 7, 0.9, 1.25, DIP, 1.7);
    placeTier(1, 'arecaPalms', 8, 0.8, 1.15, ARE, 1.0);
    placeTier(1, 'bambooClumps', 18, 0.8, 1.3, undefined, 0.9);
    placeTier(1, 'treeFerns', 16, 0.8, 1.3, undefined, 0.8);
    placeTier(1, 'saplings', 26, 0.5, 0.9, undefined, 0.65);
    placeTier(1, 'bananaClumps', 14, 0.8, 1.2);
    placeTier(1, 'pandanusShrubs', 12, 0.75, 1.2);
    placeTier(1, 'mossLogs', 7, 0.85, 1.2);
    placeTier(1, 'ferns', 44, 0.8, 1.4);
    placeTier(1, 'boulders', 10, 0.7, 1.35, undefined, 1.2);
    placeTier(1, 'pebbles', 22, 0.75, 1.3);
    placeTier(1, 'grassSmall', 100, 0.8, 1.4);
    placeTier(1, 'grassTall', 46, 0.85, 1.35);
    placeTier(1, 'flowers', 44, 0.85, 1.3);

    // Tier 2 summit garden around the bell tower
    placeTier(2, 'highlandTrees', 5, 0.65, 0.95, HIG, 1.4);
    placeTier(2, 'canopyTrees', 4, 0.65, 0.92, CAN, 1.4);
    placeTier(2, 'bambooClumps', 6, 0.7, 1.0, undefined, 0.85);
    placeTier(2, 'treeFerns', 7, 0.75, 1.1, undefined, 0.8);
    placeTier(2, 'saplings', 9, 0.5, 0.8, undefined, 0.65);
    placeTier(2, 'bananaClumps', 5, 0.75, 1.05);
    placeTier(2, 'pandanusShrubs', 5, 0.7, 1.0);
    placeTier(2, 'mossLogs', 2, 0.8, 1.0);
    placeTier(2, 'ferns', 16, 0.75, 1.2);
    placeTier(2, 'boulders', 4, 0.65, 1.0, undefined, 1.1);
    placeTier(2, 'pebbles', 8, 0.75, 1.1);
    placeTier(2, 'grassSmall', 34, 0.8, 1.3);
    placeTier(2, 'grassTall', 14, 0.8, 1.2);
    placeTier(2, 'flowers', 18, 0.8, 1.2);
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
  const tintRng = createRng(4242 + night);
  const tintColor = new THREE.Color();
  const nextTint = (): THREE.Color => {
    const v = 0.78 + tintRng() * 0.38;
    return tintColor.setRGB(
      v * (0.9 + tintRng() * 0.2),
      v * (0.92 + tintRng() * 0.16),
      v * (0.88 + tintRng() * 0.22),
      THREE.LinearSRGBColorSpace
    );
  };

  const lambertMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: '#1a1612',
    emissiveIntensity: 0.5,
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
      inst.setColorAt(i, nextTint());
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
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
      crownInst.setColorAt(i, nextTint());
      swayItems.push({ x: it.crownX, y: it.crownY, z: it.crownZ, yaw: it.yaw, scale: it.scale, idx: i, vis: 1 });
    }
    crownInst.instanceMatrix.needsUpdate = true;
    if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
    crownInst.matrixAutoUpdate = false;
    crownInst.updateMatrix();
    scene.add(crownInst);
    swayBatches.push({ inst: crownInst, items: swayItems, amplitude, occlude: true });
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
      reedInst.setColorAt(i, nextTint());
      reedSway.push({ x: it.x, y: it.y, z: it.z, yaw: it.yaw, scale: it.scale, idx: i, vis: 1 });
    }
    reedInst.instanceMatrix.needsUpdate = true;
    if (reedInst.instanceColor) reedInst.instanceColor.needsUpdate = true;
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
