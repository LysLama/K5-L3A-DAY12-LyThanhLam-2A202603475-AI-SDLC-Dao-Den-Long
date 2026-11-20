import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildShadeGeometries,
  colorizeGeo,
  createDrifterModel,
  createMayArmGroup,
  createMayBodyGeometry,
  mergeParts
} from '../../src/client/characterModels';

function triangleCount(geo: THREE.BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  const pos = geo.getAttribute('position');
  return pos ? pos.count / 3 : 0;
}

function assertFiniteGeometry(geo: THREE.BufferGeometry, requireColor = false): void {
  const pos = geo.getAttribute('position');
  expect(pos).toBeDefined();
  expect(pos.count).toBeGreaterThan(0);
  for (let i = 0; i < pos.array.length; i++) {
    expect(Number.isFinite(pos.array[i])).toBe(true);
  }
  const norm = geo.getAttribute('normal');
  expect(norm).toBeDefined();
  for (let i = 0; i < norm.array.length; i++) {
    expect(Number.isFinite(norm.array[i])).toBe(true);
  }
  if (requireColor) {
    const col = geo.getAttribute('color');
    expect(col).toBeDefined();
    expect(col.count).toBe(pos.count);
  }
}

describe('upgraded 3D character & monster geometry builders', () => {
  it('builds Mây body and shoulder-pivoted downward arms with bamboo lantern mount', () => {
    const bodyGeo = createMayBodyGeometry();
    assertFiniteGeometry(bodyGeo, true);

    const rightArm = createMayArmGroup('right');
    const rightBox = new THREE.Box3().setFromObject(rightArm.group);
    expect(rightBox.max.y).toBeLessThanOrEqual(0.085);
    expect(rightBox.min.y).toBeLessThanOrEqual(-0.34);
    expect(rightArm.lanternMount).toBeUndefined();

    const leftArm = createMayArmGroup('left');
    const leftBox = new THREE.Box3().setFromObject(leftArm.group);
    expect(leftBox.max.y).toBeLessThanOrEqual(0.28);
    expect(leftBox.min.y).toBeLessThanOrEqual(-0.30);
    expect(leftBox.max.z).toBeGreaterThanOrEqual(0.32);
    expect(leftArm.lanternMount).toBeDefined();
    const [mx, my, mz] = leftArm.lanternMount!;
    expect(Math.hypot(mx, mz)).toBeGreaterThanOrEqual(0.32);
    expect(my).toBeGreaterThanOrEqual(-0.35);
    expect(my).toBeLessThanOrEqual(0.28);

    bodyGeo.dispose();
  });

  it('builds terrifying, instancing-budgeted Bóng Mực wraith geometries with outstretched claws & fissure', () => {
    const shade = buildShadeGeometries();
    assertFiniteGeometry(shade.bodyGeo, true);
    assertFiniteGeometry(shade.clawGeo, true);
    assertFiniteGeometry(shade.eyeGeo, false);
    assertFiniteGeometry(shade.wispGeo, false);

    // Performance budget for 200 simultaneous bench Shades
    expect(triangleCount(shade.bodyGeo)).toBeLessThanOrEqual(450);
    expect(triangleCount(shade.clawGeo)).toBeLessThanOrEqual(300);
    expect(triangleCount(shade.eyeGeo)).toBeLessThanOrEqual(180);
    expect(triangleCount(shade.wispGeo)).toBeLessThanOrEqual(180);

    shade.clawGeo.computeBoundingBox();
    const clawBox = shade.clawGeo.boundingBox!;
    expect(clawBox.max.z).toBeGreaterThanOrEqual(0.48);
    expect(clawBox.min.x).toBeLessThanOrEqual(-0.34);
    expect(clawBox.max.x).toBeGreaterThanOrEqual(0.34);

    shade.eyeGeo.computeBoundingBox();
    const eyeBox = shade.eyeGeo.boundingBox!;
    expect(eyeBox.max.z).toBeGreaterThanOrEqual(0.28);
    expect(eyeBox.min.y).toBeLessThanOrEqual(0.1);

    shade.wispGeo.computeBoundingBox();
    const wispBox = shade.wispGeo.boundingBox!;
    expect(wispBox.min.x).toBeLessThanOrEqual(-0.35);
    expect(wispBox.max.x).toBeGreaterThanOrEqual(0.35);

    shade.bodyGeo.dispose();
    shade.clawGeo.dispose();
    shade.eyeGeo.dispose();
    shade.wispGeo.dispose();
  });

  it('builds haunting Gió Lạc gale-wraith with vortex rings, wing fins, and tapered serpentine tail', () => {
    const drifter = createDrifterModel();
    expect(drifter.group.children.length).toBeGreaterThanOrEqual(4);
    expect(drifter.stolenOrbs).toHaveLength(3);
    expect(drifter.trailSegments.length).toBeGreaterThanOrEqual(6);

    for (let i = 1; i < drifter.trailSegments.length; i++) {
      expect(drifter.trailSegments[i].scale.x).toBeLessThan(drifter.trailSegments[i - 1].scale.x);
    }

    let totalTris = 0;
    drifter.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        totalTris += triangleCount(obj.geometry);
        assertFiniteGeometry(obj.geometry, false);
      }
    });
    expect(totalTris).toBeLessThanOrEqual(1800);

    // Smoke check shared merge utility strips UVs safely across mixed primitives
    const mixed = mergeParts([
      colorizeGeo(new THREE.BoxGeometry(0.1, 0.1, 0.1), 0xffffff),
      colorizeGeo(new THREE.ConeGeometry(0.1, 0.2, 6), 0x000000)
    ]);
    assertFiniteGeometry(mixed, true);
    mixed.dispose();
  });
});
