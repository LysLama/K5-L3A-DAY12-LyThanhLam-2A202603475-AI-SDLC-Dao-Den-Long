import * as THREE from 'three';
import { getMapConfig, getRampHeightAt } from '../sim/maps';
import type { NightId } from '../sim/types';
import { colorizeGeo, mergeParts } from './characterModels';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function distToSegment2D(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function getDiscCenterForNight(night: NightId, x: number): number {
  if (night !== 2) return 0;
  return x >= 35 ? 70 : 0;
}

/**
 * Computes distance clearance weight `w in [0, 1]` where `0` strictly pins playable plazas,
 * lanterns, bridge ends, docks, and Night 3 central structures/ramps flush to simulation elevation.
 * When `avoidMotesAndPaths` is true (for solid obstacles), also clears radial footpaths, motes, and jump pads.
 */
function computeReliefWeight(
  night: NightId,
  centerX: number,
  radius: number,
  wx: number,
  wz: number,
  extraPad = 0,
  avoidMotesAndPaths = true
): number {
  const cfg = getMapConfig(night);
  const rLocal = Math.hypot(wx - centerX, wz);
  let w = 1.0;

  const pinCircle = (cx: number, cz: number, innerR: number, blendSpan: number) => {
    const d = Math.hypot(wx - cx, wz - cz);
    w = Math.min(w, smoothstep(innerR + extraPad, innerR + extraPad + blendSpan, d));
  };

  // Pin spawn plaza
  const spawnX = night === 2 ? centerX : cfg.spawnPos[0];
  const spawnZ = cfg.spawnPos[2];
  pinCircle(spawnX, spawnZ, 4.4, 3.0);

  // Pin Night 3 Tier 1 & Tier 2 central structure, ramps & south spawn vista behind camera
  if (night === 3) {
    pinCircle(0, 0, 26.2, 4.0);
    if (getRampHeightAt(wx, wz) !== null) return 0;
    const southVista = distToSegment2D(wx, wz, 0, 28, 0, 46);
    w = Math.min(w, smoothstep(4.2 + extraPad, 7.2 + extraPad, southVista));
  }

  // Pin Night 1 dock south corridor & Night 2 bridge ends
  if (night === 1) {
    const dockDist = distToSegment2D(wx, wz, 0, 26, 0, 42);
    w = Math.min(w, smoothstep(2.8 + extraPad, 5.2 + extraPad, dockDist));
  }
  if (night === 2) {
    const bridgeCorridor = distToSegment2D(wx, wz, 20, 0, 50, 0);
    w = Math.min(w, smoothstep(3.4 + extraPad, 6.0 + extraPad, bridgeCorridor));
    if (avoidMotesAndPaths) {
      const mainAvenue = distToSegment2D(wx, wz, 0, 0, 70, 0);
      w = Math.min(w, smoothstep(3.6 + extraPad, 5.8 + extraPad, mainAvenue));
    }
  }

  // Pin lanterns, and optionally radial paths / motes / jump pads / charms
  for (const l of cfg.lanterns) {
    if (l.pos[1] !== 0) continue;
    const lxDisc = getDiscCenterForNight(night, l.pos[0]);
    if (lxDisc !== centerX) continue;
    pinCircle(l.pos[0], l.pos[2], 3.2, 2.6);
    if (avoidMotesAndPaths) {
      const pathDist = distToSegment2D(wx, wz, spawnX, spawnZ, l.pos[0], l.pos[2]);
      w = Math.min(w, smoothstep(2.2 + extraPad, 4.2 + extraPad, pathDist));
    }
  }

  if (avoidMotesAndPaths) {
    for (const m of cfg.moteSpawnPoints) {
      if (m[1] !== 0) continue;
      if (Math.hypot(m[0] - centerX, m[2]) > radius + 1) continue;
      pinCircle(m[0], m[2], 1.4, 1.6);
    }
  }
  for (const jp of cfg.jumpPads) {
    if (jp.pos[1] !== 0) continue;
    pinCircle(jp.pos[0], jp.pos[2], 2.2, 2.0);
  }
  for (const c of cfg.charms) {
    if (c.pos[1] !== 0) continue;
    pinCircle(c.pos[0], c.pos[2], 2.4, 2.0);
  }

  // Softly blend outer cliff lip down near shoreline so skirt/stone rim meets cleanly
  if (rLocal > radius - 1.6) {
    w *= 1 - smoothstep(radius - 1.6, radius + 0.15, rLocal);
  }
  return w;
}

/**
 * Deterministic multi-octave tropical island relief height (meters above simulation plane Y=0).
 * Keeps spawn, lanterns, bridges, and ramps flush while forming rolling grassy hills across
 * forest clearings and higher perimeter jungle bluffs.
 */
export function sampleIslandElevation(
  night: NightId,
  centerX: number,
  radius: number,
  worldX: number,
  worldZ: number
): number {
  const lx = worldX - centerX;
  const lz = worldZ;
  const r = Math.hypot(lx, lz);
  if (r > radius) return 0;

  const weight = computeReliefWeight(night, centerX, radius, worldX, worldZ, 0, false);
  if (weight <= 0.001) return 0;

  const angle = Math.atan2(lz, lx);
  const rNorm = r / Math.max(1, radius);

  // Rolling grassy hills throughout interior clearings (0.45..0.95m gentle playable slopes)
  const midMound =
    smoothstep(0.18, 0.45, rNorm) *
    (0.55 + 0.45 * Math.sin(lx * 0.19 + lz * 0.15 + night * 0.8) * Math.cos(lz * 0.21 - lx * 0.14)) *
    0.88;

  // Dramatic outer forested cliff bluff ring along rNorm ∈ [0.68..0.98]
  const outerBluffBand = smoothstep(0.62, 0.86, rNorm) * (1 - smoothstep(0.94, 1.0, rNorm));
  const ridgeWave =
    0.6 +
    0.4 * Math.sin(angle * (night === 1 ? 5 : night === 2 ? 4 : 6) + night * 1.1) +
    0.25 * Math.cos(lx * 0.21 - lz * 0.19 + night);

  const bluffHeight = (night === 3 ? 2.05 : night === 2 ? 1.45 : 1.70) * outerBluffBand * ridgeWave;
  return Math.max(0, weight * (midMound + bluffHeight));
}

/**
 * Returns the visual ground elevation offset (`>= 0`) for characters, shades, and motes on base island ground
 * so rendered actors walk smoothly OVER rolling 3D hills instead of clipping through terrain.
 */
export function getVisualGroundLift(night: NightId, worldX: number, worldZ: number, simY: number): number {
  // Never lift when falling below cliff rim or standing on elevated Night 3 tiers/ramps
  if (simY < -0.1) return 0;
  if (night === 3 && (simY > 0.25 || Math.hypot(worldX, worldZ) < 25.0)) return 0;

  if (night === 1) {
    return Math.hypot(worldX, worldZ) <= 40.0 ? sampleIslandElevation(1, 0, 40, worldX, worldZ) : 0;
  }
  if (night === 2) {
    if (Math.hypot(worldX, worldZ) <= 28.0) return sampleIslandElevation(2, 0, 28, worldX, worldZ);
    if (Math.hypot(worldX - 70, worldZ) <= 28.0) return sampleIslandElevation(2, 70, 28, worldX, worldZ);
    return 0;
  }
  return Math.hypot(worldX, worldZ) <= 45.0 ? sampleIslandElevation(3, 0, 45, worldX, worldZ) : 0;
}

/**
 * Returns true if placing an obstacle (tree trunk, large boulder, dense shrub) at `(worldX, worldZ)`
 * preserves generous clearance around walkways, spawn, lanterns, motes, jump pads, bridge, and ramps.
 */
export function isClearPlayableSpot(
  night: NightId,
  centerX: number,
  radius: number,
  worldX: number,
  worldZ: number,
  clearanceMargin = 1.0
): boolean {
  const rLocal = Math.hypot(worldX - centerX, worldZ);
  if (rLocal < 5.0 || rLocal > radius - 0.8) return false;
  const w = computeReliefWeight(night, centerX, radius, worldX, worldZ, clearanceMargin, true);
  return w >= 0.32;
}

/**
 * Builds vertex-displaced, vertex-colored sculpted terrain geometry aligned 1:1 with `createIslandGroundTexture`.
 */
export function buildSculptedIslandMesh(
  night: NightId,
  centerX: number,
  radius: number
): THREE.BufferGeometry {
  const geo = new THREE.RingGeometry(0.001, radius, 64, 24);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const colors = new Float32Array(pos.count * 3);

  const cPath = new THREE.Color('#ffffff');
  const cMidGrass = new THREE.Color('#d2ebda');
  const cHighMoss = new THREE.Color('#9ed4b1');
  const cRimEarth = new THREE.Color('#aab6bf');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const r = Math.hypot(lx, lz);
    const y = sampleIslandElevation(night, centerX, radius, centerX + lx, lz);
    pos.setY(i, y);

    // Explicit top-down UV alignment with createIslandGroundTexture
    uv.setXY(i, 0.5 + lx / (2 * radius), 0.5 - lz / (2 * radius));

    const hillT = smoothstep(0.15, 1.35, y);
    const rimT = smoothstep(radius * 0.88, radius, r);
    tmp.copy(cPath).lerp(cMidGrass, smoothstep(0.05, 0.55, y)).lerp(cHighMoss, hillT);
    if (rimT > 0.05) tmp.lerp(cRimEarth, rimT * 0.65);

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds layered coastal cliff skirt, offshore rocky reef islets, and lapping water foam rings.
 */
export function buildCoastalAndOffshoreDetails(
  night: NightId,
  centerX: number,
  radius: number
): THREE.Group {
  const group = new THREE.Group();

  // Jagged stepped stone cliff collar & submerged reef skirt beneath main island rim
  const cliffParts: THREE.BufferGeometry[] = [];
  const cliffCount = Math.round(radius * 0.85);
  for (let i = 0; i < cliffCount; i++) {
    const a = (i / cliffCount) * Math.PI * 2;
    if (night === 1 && Math.abs(a - Math.PI / 2) < 0.16) continue;
    const x = centerX + Math.cos(a) * (radius - 0.55);
    const z = Math.sin(a) * (radius - 0.55);
    if (night === 2 && x > 20 && x < 50 && Math.abs(z) < 9.5) continue;

    const h = 2.2 + ((i * 7) % 5) * 0.38;
    const w = 1.35 + ((i * 11) % 4) * 0.30;
    const crag = new THREE.DodecahedronGeometry(w, 0);
    crag.scale(1.05, h / (w * 1.4), 0.9);
    crag.rotateY(a + i * 0.7);
    crag.translate(x, -1.85 - (i % 2) * 0.35, z);
    cliffParts.push(colorizeGeo(crag, i % 3 === 0 ? '#375c4f' : '#404b69'));
  }

  // Sculpted offshore jungle islets & sea-stack crags out in the twilight archipelago
  const isletSeeds =
    night === 2
      ? centerX === 0
        ? [
            { x: 35, z: -26, r: 5.8, h: 6.8 },
            { x: 35, z: 25, r: 4.8, h: 5.4 },
            { x: -40, z: -22, r: 7.5, h: 8.4 },
            { x: -36, z: 26, r: 6.2, h: 6.8 }
          ]
        : [
            { x: 110, z: 22, r: 7.0, h: 7.8 },
            { x: 106, z: -24, r: 6.0, h: 6.4 }
          ]
      : [
          { x: centerX + radius + 17, z: -18, r: 7.4, h: 8.6 },
          { x: centerX - radius - 16, z: 16, r: 6.8, h: 7.4 },
          { x: centerX + 18, z: -radius - 17, r: 8.2, h: 9.2 },
          { x: centerX - 24, z: radius + 19, r: 6.4, h: 6.6 },
          { x: centerX + radius + 10, z: radius - 4, r: 4.6, h: 5.2 }
        ];

  const foamParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < isletSeeds.length; i++) {
    const isl = isletSeeds[i];
    const rockBase = new THREE.ConeGeometry(isl.r, isl.h + 10.5, 7);
    rockBase.translate(isl.x, -10.5 + (isl.h + 10.5) * 0.46, isl.z);
    cliffParts.push(colorizeGeo(rockBase, '#3d4863'));

    const mossCap = new THREE.DodecahedronGeometry(isl.r * 0.65, 0);
    mossCap.scale(1.25, 0.45, 1.15);
    mossCap.translate(isl.x + 0.3, -0.3 + isl.h * 0.25, isl.z - 0.2);
    cliffParts.push(colorizeGeo(mossCap, '#356b57'));

    // Miniature tropical tree crowns atop offshore islets so horizon feels like an archipelago
    const crown1 = new THREE.IcosahedronGeometry(isl.r * 0.34, 0);
    crown1.scale(1.2, 0.75, 1.1);
    crown1.translate(isl.x + 0.3, 1.3 + isl.h * 0.25, isl.z - 0.2);
    cliffParts.push(colorizeGeo(crown1, '#255c47'));

    const crown2 = new THREE.ConeGeometry(isl.r * 0.24, 2.2, 6);
    crown2.translate(isl.x - isl.r * 0.22, 1.4 + isl.h * 0.25, isl.z + isl.r * 0.18);
    cliffParts.push(colorizeGeo(crown2, '#2d6e53'));

    const ring = new THREE.RingGeometry(isl.r * 0.96, isl.r * 1.18, 18);
    ring.rotateX(-Math.PI / 2);
    ring.translate(isl.x, -10.42, isl.z);
    foamParts.push(colorizeGeo(ring, '#357487'));
  }

  // Lapping water foam band around main island footprint at water level (-10.42)
  const mainFoam = new THREE.RingGeometry(radius * 0.88, radius * 0.96, 44);
  mainFoam.rotateX(-Math.PI / 2);
  mainFoam.translate(centerX, -10.42, 0);
  foamParts.push(colorizeGeo(mainFoam, '#2d6375'));

  if (cliffParts.length > 0) {
    const cliffMesh = new THREE.Mesh(
      mergeParts(cliffParts),
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        emissive: '#141c2e',
        emissiveIntensity: 0.42,
        flatShading: true
      })
    );
    cliffMesh.matrixAutoUpdate = false;
    cliffMesh.updateMatrix();
    group.add(cliffMesh);
  }
  if (foamParts.length > 0) {
    const foamMesh = new THREE.Mesh(
      mergeParts(foamParts),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    );
    foamMesh.matrixAutoUpdate = false;
    foamMesh.updateMatrix();
    group.add(foamMesh);
  }

  return group;
}

/**
 * Builds craggy mossy granite buttresses wrapping Night 3's Tier 1 & Tier 2 sanctuaries
 * and ancient stepped stone bases around sanctuaries so tiers blend organically into the mountain island.
 */
export function buildNight3CliffButtresses(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];

  // Buttresses around Tier 1 outer wall (r = 24.0, z > 0.8, height 3.0)
  for (let i = 1; i <= 11; i++) {
    const a = (i / 12) * Math.PI; // 0..PI corresponds to +Z semicircle
    const x = Math.cos(a) * 24.1;
    const z = Math.sin(a) * 24.1;
    if (getRampHeightAt(Math.cos(a) * 26, Math.sin(a) * 26) !== null) continue;
    const rock = new THREE.DodecahedronGeometry(1.15, 0);
    rock.scale(0.95, 1.55 + (i % 3) * 0.25, 0.85);
    rock.rotateY(a);
    rock.translate(x, 1.45, z);
    parts.push(colorizeGeo(rock, i % 2 === 0 ? '#434d6b' : '#385f55'));
  }

  // Crags around Tier 2 sanctuary cliff wall (r = 8.0, height 6.0)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.25;
    const x = Math.cos(a) * 8.15;
    const z = Math.sin(a) * 8.15;
    const pillarRock = new THREE.DodecahedronGeometry(0.95, 0);
    pillarRock.scale(0.85, 2.8 + (i % 2) * 0.6, 0.85);
    pillarRock.rotateY(a * 1.3);
    pillarRock.translate(x, 2.9, z);
    parts.push(colorizeGeo(pillarRock, i % 2 === 0 ? '#4a5575' : '#3d665b'));
  }

  const mesh = new THREE.Mesh(
    mergeParts(parts),
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      emissive: '#151d2e',
      emissiveIntensity: 0.45,
      flatShading: true
    })
  );
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
