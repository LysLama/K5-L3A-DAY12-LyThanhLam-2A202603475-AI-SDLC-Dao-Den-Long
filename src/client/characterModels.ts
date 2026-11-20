import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './palette';

function stripUv(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.hasAttribute('uv')) geo.deleteAttribute('uv');
  return geo;
}

/**
 * Converts geometry to non-indexed form, strips unused UVs, and bakes uniform vertex colors.
 */
export function colorizeGeo(geo: THREE.BufferGeometry, hex: string | number): THREE.BufferGeometry {
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  if (geo.index) geo.dispose();
  stripUv(nonIdx);
  if (!nonIdx.hasAttribute('normal')) nonIdx.computeVertexNormals();
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

function normalizeUncoloredGeo(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  if (geo.index) geo.dispose();
  stripUv(nonIdx);
  if (nonIdx.hasAttribute('color')) nonIdx.deleteAttribute('color');
  if (!nonIdx.hasAttribute('normal')) nonIdx.computeVertexNormals();
  return nonIdx;
}

/**
 * Merges multiple BufferGeometries cleanly and disposes the temporary inputs.
 */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((p) => {
    const nonIdx = p.index ? p.toNonIndexed() : p;
    if (p.index) p.dispose();
    stripUv(nonIdx);
    if (!nonIdx.hasAttribute('normal')) nonIdx.computeVertexNormals();
    return nonIdx;
  });
  const merged = mergeGeometries(normalized, false);
  for (const p of normalized) p.dispose();
  if (!merged) throw new Error('Failed to merge Three.js geometries');
  return merged;
}

function transformGeo(
  geo: THREE.BufferGeometry,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1]
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
  geo.applyMatrix4(m);
  return geo;
}

export interface MayArmRig {
  group: THREE.Group;
  lanternMount?: [number, number, number];
}

export interface ShadeGeometrySet {
  bodyGeo: THREE.BufferGeometry;
  clawGeo: THREE.BufferGeometry;
  eyeGeo: THREE.BufferGeometry;
  wispGeo: THREE.BufferGeometry;
}

export interface DrifterModelRig {
  group: THREE.Group;
  bodyMat: THREE.MeshLambertMaterial;
  coreRing: THREE.Mesh;
  outerRing: THREE.Mesh;
  finLeft: THREE.Mesh;
  finRight: THREE.Mesh;
  trailSegments: THREE.Mesh[];
  stolenOrbs: THREE.Mesh[];
}

/**
 * Builds Mây's merged body/head/nón lá geometry with contoured áo dài shoulders and neck.
 */
export function createMayBodyGeometry(): THREE.BufferGeometry {
  const dressProfile = [
    new THREE.Vector2(0.41, 0.18),
    new THREE.Vector2(0.35, 0.42),
    new THREE.Vector2(0.195, 0.69),
    new THREE.Vector2(0.175, 0.86),
    new THREE.Vector2(0.20, 0.99),
    new THREE.Vector2(0.115, 1.06),
    new THREE.Vector2(0.0, 1.06)
  ];

  const parts: THREE.BufferGeometry[] = [
    colorizeGeo(new THREE.LatheGeometry(dressProfile, 16), PALETTE.mayCloak),
    // Waist sash & front áo dài scarlet border trim
    colorizeGeo(
      transformGeo(new THREE.TorusGeometry(0.195, 0.03, 8, 16), [0, 0.70, 0], [Math.PI / 2, 0, 0]),
      PALETTE.mayScarf
    ),
    colorizeGeo(
      transformGeo(new THREE.BoxGeometry(0.11, 0.28, 0.04), [0, 0.50, 0.30], [-0.28, 0, 0]),
      PALETTE.mayScarf
    ),
    // Fitted crimson collar & slim neck
    colorizeGeo(
      transformGeo(new THREE.TorusGeometry(0.118, 0.032, 8, 16), [0, 1.065, 0], [Math.PI / 2, 0, 0]),
      PALETTE.mayScarf
    ),
    colorizeGeo(
      transformGeo(new THREE.CylinderGeometry(0.072, 0.088, 0.10, 10), [0, 1.11, 0]),
      '#ffe3c7'
    ),
    // Head, dark hair cap & side locks, gentle eyes
    colorizeGeo(transformGeo(new THREE.SphereGeometry(0.215, 12, 10), [0, 1.25, 0]), '#ffe3c7'),
    colorizeGeo(transformGeo(new THREE.SphereGeometry(0.222, 12, 10), [0, 1.275, -0.05]), '#241b38'),
    colorizeGeo(transformGeo(new THREE.SphereGeometry(0.095, 8, 8), [0, 1.18, -0.18]), '#241b38'),
    colorizeGeo(transformGeo(new THREE.SphereGeometry(0.028, 6, 6), [-0.078, 1.245, 0.202]), '#1b1426'),
    colorizeGeo(transformGeo(new THREE.SphereGeometry(0.028, 6, 6), [0.078, 1.245, 0.202]), '#1b1426'),
    // Nón lá + bamboo edge rim + finial tip
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.64, 0.33, 20), [0, 1.50, 0]), PALETTE.sand),
    colorizeGeo(
      transformGeo(new THREE.TorusGeometry(0.632, 0.024, 8, 20), [0, 1.335, 0], [Math.PI / 2, 0, 0]),
      PALETTE.wood
    ),
    colorizeGeo(transformGeo(new THREE.ConeGeometry(0.045, 0.07, 8), [0, 1.675, 0]), PALETTE.wood)
  ];

  return mergeParts(parts);
}

/**
 * Builds Mây's shoulder-pivoted downward arm group (`y = 0` at shoulder socket).
 * Left side includes a forward bamboo lantern pole + wrist mount cleanly clear of skirt/brim.
 */
export function createMayArmGroup(side: 'left' | 'right'): MayArmRig {
  const sign = side === 'left' ? -1 : 1;
  const group = new THREE.Group();
  const armMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  const parts: THREE.BufferGeometry[] = [
    // Subtle shoulder joint tucked smoothly into áo dài silhouette
    colorizeGeo(
      transformGeo(new THREE.SphereGeometry(0.056, 8, 8), [sign * 0.01, -0.015, 0]),
      PALETTE.mayCloak
    ),
    // Upper arm sleeve descending downward from shoulder
    colorizeGeo(
      transformGeo(
        new THREE.CylinderGeometry(0.052, 0.068, 0.19, 10),
        [sign * 0.028, -0.095, 0.015],
        [-0.12, 0, sign * 0.14]
      ),
      PALETTE.mayCloak
    )
  ];

  if (side === 'right') {
    // Free right forearm swinging naturally down along hip
    parts.push(
      colorizeGeo(
        transformGeo(
          new THREE.CylinderGeometry(0.068, 0.088, 0.18, 10),
          [0.055, -0.25, 0.055],
          [-0.28, 0, 0.12]
        ),
        PALETTE.mayCloak
      ),
      colorizeGeo(
        transformGeo(
          new THREE.TorusGeometry(0.082, 0.014, 6, 12),
          [0.065, -0.335, 0.08],
          [Math.PI / 2 - 0.28, 0, 0.12]
        ),
        PALETTE.mayScarf
      ),
      colorizeGeo(
        transformGeo(new THREE.SphereGeometry(0.048, 8, 8), [0.068, -0.365, 0.09]),
        '#ffe3c7'
      )
    );
    group.add(new THREE.Mesh(mergeParts(parts), armMat));
    return { group };
  }

  // Left arm reaches slightly forward-outward to grasp a bamboo lantern staff
  parts.push(
    colorizeGeo(
      transformGeo(
        new THREE.CylinderGeometry(0.066, 0.085, 0.18, 10),
        [-0.06, -0.22, 0.095],
        [-0.78, 0, -0.18]
      ),
      PALETTE.mayCloak
    ),
    colorizeGeo(
      transformGeo(
        new THREE.TorusGeometry(0.08, 0.014, 6, 12),
        [-0.085, -0.27, 0.165],
        [Math.PI / 2 - 0.78, 0, -0.18]
      ),
      PALETTE.mayScarf
    ),
    // Warm hand gripping the staff
    colorizeGeo(
      transformGeo(new THREE.SphereGeometry(0.05, 8, 8), [-0.095, -0.285, 0.195]),
      '#ffe3c7'
    ),
    // Slender bamboo lantern pole tilted forward & slightly outward past the skirt/hat
    colorizeGeo(
      transformGeo(
        new THREE.CylinderGeometry(0.014, 0.018, 0.46, 6),
        [-0.16, -0.13, 0.30],
        [0.62, 0, 0.32]
      ),
      PALETTE.wood
    ),
    // Brass/gold crook tip where the lantern cord hangs
    colorizeGeo(
      transformGeo(new THREE.SphereGeometry(0.022, 6, 6), [-0.23, 0.04, 0.42]),
      PALETTE.goldUi
    )
  );

  group.add(new THREE.Mesh(mergeParts(parts), armMat));
  return {
    group,
    lanternMount: [-0.23, 0.04, 0.42]
  };
}

function shadeGradientGeo(
  geo: THREE.BufferGeometry,
  lowScale: number,
  highScale: number,
  yMin = -0.75,
  yMax = 0.85
): THREE.BufferGeometry {
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  if (geo.index) geo.dispose();
  stripUv(nonIdx);
  if (!nonIdx.hasAttribute('normal')) nonIdx.computeVertexNormals();
  const pos = nonIdx.getAttribute('position');
  const norm = nonIdx.getAttribute('normal');
  const arr = new Float32Array(pos.count * 3);
  const span = Math.max(0.01, yMax - yMin);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) - yMin) / span));
    const upRim = Math.max(0, norm.getY(i)) * 0.18;
    const v = Math.min(1, lowScale + (highScale - lowScale) * t + upRim);
    arr[i * 3] = v;
    arr[i * 3 + 1] = v * 0.94;
    arr[i * 3 + 2] = v;
  }
  nonIdx.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return nonIdx;
}

/**
 * Builds haunted, hunched, horned-and-clawed Bóng Mực wraith geometries
 * kept strictly within the instancing triangle budget for 200 simultaneous bench Shades.
 */
export function buildShadeGeometries(): ShadeGeometrySet {
  // 1. Hunched jagged shroud torso + hooded cowl + curved horns + dorsal spine ridges
  // Vertex-baked shading creates deep abyssal recess inside cowl + crisp upper rim highlight (zero light overhead)
  const wraithProfile = [
    new THREE.Vector2(0.0, -0.76),
    new THREE.Vector2(0.39, -0.58),
    new THREE.Vector2(0.24, -0.20),
    new THREE.Vector2(0.44, 0.18),
    new THREE.Vector2(0.30, 0.38),
    new THREE.Vector2(0.0, 0.65)
  ];
  const bodyParts: THREE.BufferGeometry[] = [
    shadeGradientGeo(
      transformGeo(new THREE.LatheGeometry(wraithProfile, 7), [0, 0, 0], [0.18, 0, 0], [1, 1, 0.92]),
      0.34,
      0.92
    ),
    // Pitch-dark hollow face recess beneath hood brow so glowing eyes burn out of void
    colorizeGeo(
      transformGeo(new THREE.OctahedronGeometry(0.18, 0), [0, 0.30, 0.24], [0, 0, 0], [0.95, 0.85, 0.55]),
      0x14121a
    ),
    // Sinister peaked hood cowl jutting over face cavity
    shadeGradientGeo(
      transformGeo(new THREE.ConeGeometry(0.33, 0.56, 5), [0, 0.48, 0.10], [1.22, 0, 0]),
      0.65,
      1.0
    ),
    // Bowed jagged shoulder ridges
    shadeGradientGeo(
      transformGeo(new THREE.ConeGeometry(0.16, 0.44, 4), [-0.36, 0.34, 0.02], [0.25, 0, 0.96]),
      0.58,
      0.98
    ),
    shadeGradientGeo(
      transformGeo(new THREE.ConeGeometry(0.16, 0.44, 4), [0.36, 0.34, 0.02], [0.25, 0, -0.96]),
      0.58,
      0.98
    )
  ];

  // Swept curved devil horns + 3 dorsal spine spikes
  for (const s of [-1, 1]) {
    bodyParts.push(
      shadeGradientGeo(
        transformGeo(
          new THREE.ConeGeometry(0.105, 0.40, 4),
          [s * 0.21, 0.63, -0.02],
          [-0.45, 0, -s * 0.44]
        ),
        0.65,
        1.0
      ),
      shadeGradientGeo(
        transformGeo(
          new THREE.ConeGeometry(0.055, 0.36, 4),
          [s * 0.31, 0.87, -0.19],
          [-0.98, 0, -s * 0.18]
        ),
        0.82,
        1.0
      )
    );
  }
  const dorsalHeights = [0.26, 0.05, -0.15];
  for (let i = 0; i < dorsalHeights.length; i++) {
    bodyParts.push(
      shadeGradientGeo(
        transformGeo(
          new THREE.ConeGeometry(0.07 - i * 0.01, 0.30 - i * 0.04, 3),
          [0, dorsalHeights[i], -0.34 - i * 0.02],
          [-1.28, 0, 0]
        ),
        0.72,
        1.0
      )
    );
  }

  // 2. Twin sleek gaunt arms + long razor-curved ghostly claws reaching toward Mây
  const clawParts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    // Tapered arm reaching forward from shoulder cleanly into wrist palm (+1.38 around X tilts +Y tip -> +Z forward)
    clawParts.push(
      colorizeGeo(
        transformGeo(
          new THREE.CylinderGeometry(0.052, 0.086, 0.44, 5),
          [s * 0.38, 0.14, 0.24],
          [1.38, 0, -s * 0.18]
        ),
        '#2b174a'
      ),
      // Gaunt wrist palm rooting all 3 talons solidly with zero air gap
      colorizeGeo(
        transformGeo(new THREE.OctahedronGeometry(0.072, 0), [s * 0.40, 0.08, 0.44]),
        '#3d2463'
      ),
      // Sharp elbow spur pointing backward
      colorizeGeo(
        transformGeo(
          new THREE.ConeGeometry(0.042, 0.22, 3),
          [s * 0.38, 0.20, 0.01],
          [-0.85, 0, -s * 0.35]
        ),
        '#4c2e78'
      )
    );
    // Three splayed curved spectral talons anchored directly inside wrist palm
    for (let t = -1; t <= 1; t++) {
      clawParts.push(
        colorizeGeo(
          transformGeo(
            new THREE.ConeGeometry(0.025, 0.30 - Math.abs(t) * 0.04, 3),
            [s * 0.40 + t * 0.045, 0.065 + (t === 0 ? 0.015 : -0.015), 0.56],
            [1.62, -s * 0.14 - t * 0.22, 0]
          ),
          '#d8ccf2'
        )
      );
    }
  }

  // 3. Recessed fierce diagonal eyes + ominous vertical glowing chest fissures
  const eyeParts: THREE.BufferGeometry[] = [
    normalizeUncoloredGeo(
      transformGeo(
        new THREE.OctahedronGeometry(0.072, 0),
        [-0.125, 0.38, 0.37],
        [0, 0, -0.40],
        [1.50, 0.48, 0.65]
      )
    ),
    normalizeUncoloredGeo(
      transformGeo(
        new THREE.OctahedronGeometry(0.072, 0),
        [0.125, 0.38, 0.37],
        [0, 0, 0.40],
        [1.50, 0.48, 0.65]
      )
    ),
    normalizeUncoloredGeo(
      transformGeo(new THREE.OctahedronGeometry(0.085, 0), [0, 0.05, 0.39], [0, 0, 0], [0.42, 1.9, 0.5])
    ),
    normalizeUncoloredGeo(
      transformGeo(new THREE.OctahedronGeometry(0.06, 0), [-0.105, 0.03, 0.37], [0, 0, -0.25], [0.32, 1.35, 0.45])
    ),
    normalizeUncoloredGeo(
      transformGeo(new THREE.OctahedronGeometry(0.06, 0), [0.105, 0.03, 0.37], [0, 0, 0.25], [0.32, 1.35, 0.45])
    )
  ];

  // 4. Six swept-outward swirling shadow smoke tendrils below waist
  const wispParts: THREE.BufferGeometry[] = [];
  for (let w = 0; w < 6; w++) {
    const wa = (w / 6) * Math.PI * 2;
    wispParts.push(
      normalizeUncoloredGeo(
        transformGeo(
          new THREE.ConeGeometry(0.085, 0.52 + (w % 2) * 0.12, 3),
          [Math.cos(wa) * 0.46, -0.52 + (w % 2) * 0.07, Math.sin(wa) * 0.46],
          [Math.PI - 0.68 * Math.sin(wa), wa + 0.45, 0.68 * Math.cos(wa)]
        )
      )
    );
  }

  return {
    bodyGeo: mergeParts(bodyParts),
    clawGeo: mergeParts(clawParts),
    eyeGeo: mergeParts(eyeParts),
    wispGeo: mergeParts(wispParts)
  };
}

/**
 * Builds a haunting, swirling icy-gale Gió Lạc phantom rig with horned cowl,
 * hollow glowing chest crystal, tattered gale-wings, vortex rings, and 7-segment sweeping blade-tail.
 */
export function createDrifterModel(): DrifterModelRig {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: '#1d3652',
    emissiveIntensity: 0.78
  });

  // Sculpted angular horned gale-banshee hood sweeping sharply backward into crest spike
  const headParts: THREE.BufferGeometry[] = [
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.30, 0.92, 5), [0, 0.34, 0.05], [Math.PI / 2 + 0.18, 0, 0]),
      '#2c4663'
    ),
    // Swept pointed hood tail crest
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.22, 0.68, 4), [0, 0.36, -0.32], [-1.72, 0, 0]),
      '#1e334a'
    ),
    // Hollow narrow ribcage beneath mask
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.20, 0.54, 5), [0, 0.10, -0.04], [Math.PI - 0.25, 0, 0]),
      '#162538'
    ),
    // Frosted gale-horns + lower fangs
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.068, 0.56, 4), [-0.19, 0.57, 0.05], [-0.55, 0, 0.46]),
      '#c3e2f7'
    ),
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.068, 0.56, 4), [0.19, 0.57, 0.05], [-0.55, 0, -0.46]),
      '#c3e2f7'
    ),
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.052, 0.25, 3), [-0.08, 0.14, 0.32], [Math.PI - 0.22, 0, 0]),
      '#a8cce6'
    ),
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.052, 0.25, 3), [0.08, 0.14, 0.32], [Math.PI - 0.22, 0, 0]),
      '#a8cce6'
    )
  ];
  group.add(new THREE.Mesh(mergeParts(headParts), bodyMat));

  // Slanted glowing spectral eyes + pulsing storm-core crystal
  const glowMat = new THREE.MeshBasicMaterial({ color: '#e2f7ff' });
  const eyeGeoL = transformGeo(
    new THREE.OctahedronGeometry(0.06, 0),
    [-0.12, 0.36, 0.30],
    [0, 0, -0.36],
    [1.45, 0.46, 0.6]
  );
  const eyeGeoR = transformGeo(
    new THREE.OctahedronGeometry(0.06, 0),
    [0.12, 0.36, 0.30],
    [0, 0, 0.36],
    [1.45, 0.46, 0.6]
  );
  const chestCore = transformGeo(
    new THREE.OctahedronGeometry(0.11, 0),
    [0, 0.12, 0.06],
    [0, 0, 0],
    [0.72, 1.4, 0.72]
  );
  group.add(new THREE.Mesh(mergeParts([eyeGeoL, eyeGeoR, chestCore]), glowMat));

  // Twin sweeping tattered gale-wing shrouds
  const finGeo = mergeParts([
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.18, 0.92, 3), [-0.14, -0.02, -0.38], [-1.42, -0.25, 0.55], [0.42, 1, 1.35]),
      PALETTE.drifterSteel
    ),
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.12, 0.66, 3), [-0.04, -0.14, -0.28], [-1.22, -0.18, 0.78], [0.36, 1, 1.25]),
      '#c8e3f7'
    )
  ]);
  const finLeft = new THREE.Mesh(finGeo, bodyMat);
  finLeft.position.set(-0.22, 0.28, 0.0);
  const finRight = new THREE.Mesh(finGeo, bodyMat);
  finRight.position.set(0.22, 0.28, 0.0);
  finRight.scale.x = -1;
  group.add(finLeft, finRight);

  // Two thin counter-spinning cyclone vortex rings
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#a8d3f2',
    transparent: true,
    opacity: 0.74
  });
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.018, 5, 18), ringMat);
  coreRing.position.set(0, 0.22, -0.08);
  coreRing.rotation.set(Math.PI / 2 - 0.35, 0.22, 0);

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.014, 5, 18), ringMat);
  outerRing.position.set(0, 0.18, -0.22);
  outerRing.rotation.set(Math.PI / 2 + 0.32, -0.28, 0);
  group.add(coreRing, outerRing);

  // 7-segment tapering sweeping banshee wind-veil tail
  const trailSegments: THREE.Mesh[] = [];
  const segGeo = mergeParts([
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.24, 0.46, 4), [0, 0, 0], [-Math.PI / 2, 0, 0], [1.35, 0.22, 1.15]),
      PALETTE.drifterSteel
    ),
    colorizeGeo(
      transformGeo(new THREE.ConeGeometry(0.11, 0.34, 3), [0, 0.06, -0.05], [-Math.PI / 2 - 0.18, 0, 0], [0.45, 0.9, 1.0]),
      '#a8cce6'
    )
  ]);
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Mesh(segGeo, bodyMat);
    const taper = Math.max(0.20, 0.96 - i * 0.115);
    seg.position.set(0, 0.22, -0.46 - i * 0.25);
    seg.scale.set(taper, taper, 1.15);
    group.add(seg);
    trailSegments.push(seg);
  }

  // Orbiting stolen firefly orbs
  const stolenOrbs: THREE.Mesh[] = [];
  const orbGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const orbMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteGold });
  for (let i = 0; i < 3; i++) {
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.visible = false;
    group.add(orb);
    stolenOrbs.push(orb);
  }

  return { group, bodyMat, coreRing, outerRing, finLeft, finRight, trailSegments, stolenOrbs };
}
