import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getMapConfig } from '../../src/sim/maps';
import {
  createTropicalAssetCatalog,
  generateTropicalPlacementPlan,
  populateNightEcosystem
} from '../../src/client/tropicalAssets';

function triCount(geo: THREE.BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  return geo.getAttribute('position').count / 3;
}

function assertValidBakedGeo(geo: THREE.BufferGeometry, maxTris: number): void {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  expect(pos).toBeDefined();
  expect(norm).toBeDefined();
  expect(col).toBeDefined();
  expect(pos.count).toBeGreaterThan(0);
  expect(col.count).toBe(pos.count);
  expect(triCount(geo)).toBeLessThanOrEqual(maxTris);
  for (let i = 0; i < pos.array.length; i++) {
    expect(Number.isFinite(pos.array[i])).toBe(true);
    expect(Number.isFinite(norm.array[i])).toBe(true);
  }
}

describe('Vietnamese tropical 3D assets & per-night ecosystem scatterer', () => {
  it('builds finite vertex-colored geometry catalog within GPU triangle budgets for all 3 themes', () => {
    for (const night of [1, 2, 3] as const) {
      const cat = createTropicalAssetCatalog(night);
      assertValidBakedGeo(cat.coconutTrunk, 140);
      assertValidBakedGeo(cat.coconutCrown, 220);
      assertValidBakedGeo(cat.canopyTrunk, 140);
      assertValidBakedGeo(cat.canopyCrown, 260);
      assertValidBakedGeo(cat.arecaTrunk, 120);
      assertValidBakedGeo(cat.arecaCrown, 200);
      assertValidBakedGeo(cat.highlandTrunk, 140);
      assertValidBakedGeo(cat.highlandCrown, 240);
      assertValidBakedGeo(cat.bananaClump, 140);
      assertValidBakedGeo(cat.bambooClump, 140);
      assertValidBakedGeo(cat.fernClump, 120);
      assertValidBakedGeo(cat.mossBoulder, 120);
      assertValidBakedGeo(cat.pebbleCluster, 90);
      assertValidBakedGeo(cat.grassSmall, 60);
      assertValidBakedGeo(cat.grassTall, 90);
      assertValidBakedGeo(cat.flowerCluster, 110);
      assertValidBakedGeo(cat.lotusCluster, 140);

      for (const g of Object.values(cat)) g.dispose();
    }
  });

  it('generates obstacle-safe themed placements across Night 1, Night 2, and Night 3 without blocking gameplay spots', () => {
    for (const night of [1, 2, 3] as const) {
      const plan = generateTropicalPlacementPlan(night);
      const cfg = getMapConfig(night);

      expect(plan.canopyTrees.length).toBeGreaterThanOrEqual(6);
      expect(plan.boulders.length).toBeGreaterThanOrEqual(10);
      expect(plan.pebbles.length).toBeGreaterThanOrEqual(16);
      expect(plan.grassSmall.length).toBeGreaterThanOrEqual(40);
      expect(plan.grassTall.length).toBeGreaterThanOrEqual(18);
      expect(plan.flowers.length).toBeGreaterThanOrEqual(18);
      expect(plan.ferns.length).toBeGreaterThanOrEqual(14);

      if (night === 1) {
        expect(plan.coconutPalms.length).toBeGreaterThanOrEqual(8);
        expect(plan.bananaClumps.length).toBeGreaterThanOrEqual(8);
      } else if (night === 2) {
        expect(plan.arecaPalms.length).toBeGreaterThanOrEqual(14);
        expect(plan.lotusClusters.length).toBeGreaterThanOrEqual(10);
      } else {
        expect(plan.highlandTrees.length).toBeGreaterThanOrEqual(10);
        expect(plan.bambooClumps.length).toBeGreaterThanOrEqual(8);
      }

      // Solid trees & boulders never collide with spawn, lanterns, motes, or jump pads
      const solids = [
        ...plan.coconutPalms,
        ...plan.canopyTrees,
        ...plan.arecaPalms,
        ...plan.highlandTrees,
        ...plan.boulders
      ];
      for (const item of solids) {
        expect(Math.hypot(item.x - cfg.spawnPos[0], item.z - cfg.spawnPos[2])).toBeGreaterThanOrEqual(4.5);
        for (const l of cfg.lanterns) {
          if (Math.abs(l.pos[1] - item.y) < 2) {
            expect(Math.hypot(item.x - l.pos[0], item.z - l.pos[2])).toBeGreaterThanOrEqual(3.2);
          }
        }
        for (const m of cfg.moteSpawnPoints) {
          if (Math.abs(m[1] - item.y) < 1.5) {
            expect(Math.hypot(item.x - m[0], item.z - m[2])).toBeGreaterThanOrEqual(1.35);
          }
        }
      }
    }
  });

  it('populates Three.js scene with static batched InstancedMesh layers', () => {
    const scene = new THREE.Scene();
    const swayGroups = populateNightEcosystem(scene, 1);
    expect(swayGroups.length).toBeGreaterThanOrEqual(1);
    let instCount = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        instCount++;
        expect(obj.count).toBeGreaterThan(0);
      }
    });
    expect(instCount).toBeGreaterThanOrEqual(10);
  });
});
