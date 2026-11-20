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

describe('dense Vietnamese tropical 3D jungle assets & multi-size scatterer', () => {
  it('builds finite vertex-colored geometry catalog across 12+ species within GPU budgets', () => {
    for (const night of [1, 2, 3] as const) {
      const cat = createTropicalAssetCatalog(night);
      assertValidBakedGeo(cat.coconutTrunk, 140);
      assertValidBakedGeo(cat.coconutCrown, 220);
      assertValidBakedGeo(cat.canopyTrunk, 160);
      assertValidBakedGeo(cat.canopyCrown, 260);
      assertValidBakedGeo(cat.dipterocarpTrunk, 120);
      assertValidBakedGeo(cat.dipterocarpCrown, 220);
      assertValidBakedGeo(cat.mangroveArch, 180);
      assertValidBakedGeo(cat.saplingTree, 120);
      assertValidBakedGeo(cat.treeFern, 150);
      assertValidBakedGeo(cat.arecaTrunk, 120);
      assertValidBakedGeo(cat.arecaCrown, 200);
      assertValidBakedGeo(cat.highlandTrunk, 140);
      assertValidBakedGeo(cat.highlandCrown, 240);
      assertValidBakedGeo(cat.bananaClump, 140);
      assertValidBakedGeo(cat.bambooClump, 160);
      assertValidBakedGeo(cat.pandanusShrub, 130);
      assertValidBakedGeo(cat.mossLog, 140);
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

  it('generates dense multi-size tropical rainforest placements across all 3 maps cleanly clearing paths & targets', () => {
    for (const night of [1, 2, 3] as const) {
      const plan = generateTropicalPlacementPlan(night);
      const cfg = getMapConfig(night);

      const allTrees = [
        ...plan.coconutPalms,
        ...plan.canopyTrees,
        ...plan.dipterocarpTrees,
        ...plan.mangroves,
        ...plan.saplings,
        ...plan.treeFerns,
        ...plan.arecaPalms,
        ...plan.highlandTrees,
        ...plan.bambooClumps
      ];
      expect(allTrees.length).toBeGreaterThanOrEqual(85);

      // Verify wide natural size distribution (young saplings to giant emergents)
      let minS = Infinity;
      let maxS = 0;
      for (const t of allTrees) {
        if (t.scale < minS) minS = t.scale;
        if (t.scale > maxS) maxS = t.scale;
      }
      expect(maxS / minS).toBeGreaterThanOrEqual(1.65);

      const shrubs = [...plan.bananaClumps, ...plan.ferns, ...plan.pandanusShrubs, ...plan.mossLogs];
      expect(shrubs.length).toBeGreaterThanOrEqual(75);
      expect(plan.boulders.length).toBeGreaterThanOrEqual(20);
      expect(plan.pebbles.length).toBeGreaterThanOrEqual(35);
      expect(plan.grassSmall.length + plan.grassTall.length).toBeGreaterThanOrEqual(190);
      expect(plan.flowers.length).toBeGreaterThanOrEqual(35);

      if (night === 2) {
        expect(plan.arecaPalms.length).toBeGreaterThanOrEqual(24);
        expect(plan.lotusClusters.length).toBeGreaterThanOrEqual(24);
      }

      const solids = [
        ...plan.coconutPalms,
        ...plan.canopyTrees,
        ...plan.dipterocarpTrees,
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

  it('populates Three.js scene with lush batched InstancedMesh layers', () => {
    const scene = new THREE.Scene();
    const swayGroups = populateNightEcosystem(scene, 1);
    expect(swayGroups.length).toBeGreaterThanOrEqual(1);
    let instCount = 0;
    let totalInstances = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        instCount++;
        totalInstances += obj.count;
        expect(obj.count).toBeGreaterThan(0);
      }
    });
    expect(instCount).toBeGreaterThanOrEqual(16);
    expect(totalInstances).toBeGreaterThanOrEqual(550);
  });
});
