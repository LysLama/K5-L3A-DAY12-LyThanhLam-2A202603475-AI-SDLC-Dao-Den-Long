# Tropical 3D Terrain, Flora, Critters & Weather Implementation Plan

> **For agentic workers:** Native TDD execution on `feat/upgrade-3d-models` (`main` & `phase-4` tag preserved untouched).

**Goal:** Transform all 3 islands from flat single discs into lush, multi-layered Vietnamese tropical night forest ecosystems featuring sculpted terrain ridges/cliffs, diverse trees/understory/rocks/grass/flowers, distinct decorative insects, and dynamic per-night weather.

**Architecture:** Split cleanly into 3 focused client modules wired into `src/client/sceneBuilder.ts`:
1. `src/client/terrainBuilder.ts`: Deterministic terrain elevation sampler (`sampleIslandElevation`), safe gameplay clearance validator (`isClearPlayableSpot`), sculpted vertex-colored radial terrain + stepped stone cliffs/lagoons/sea-stacks (`buildSculptedIslandMesh`, `buildOffshoreIslets`, `buildCliffButtresses`).
2. `src/client/tropicalAssets.ts`: Multi-part vertex-colored 3D asset geometry builders & static `InstancedMesh` scatterers (`populateNightEcosystem`) for coconut palms, canopy trees, areca palms, bamboo, wild banana leaves, ferns, mossy boulders, small stones, tall/short grass, tropical flowers, and Night 2 lotus pads.
3. `src/client/atmosphere.ts`: `AtmosphereManager` managing animated critters (wing-flapping moths/dragonflies + high-canopy forest fireflies visually distinct from gameplay motes) and weather (wind-slanted rain streaks, drifting ground mist, blown leaves, subtle sky lightning gated by `reduceMotion`, all disabled in `benchMode`).

**Tech Stack:** TypeScript, Three.js `0.187.0` (`InstancedMesh`, custom vertex-displaced `BufferGeometry`, `vertexColors`), Vitest `5.1.1`, Electron `45.4.1` WebGL screenshot QA.

## Global Constraints
- Preserve `src/sim/`, `src/headless/`, `game.contract.json`, `main`, and tags `phase-1..phase-4`.
- Gameplay pathways, spawn plazas, lanterns (`L1..L7`), mote spawns, jump pads, bridge, and Night 3 ramps stay unobstructed (`isClearPlayableSpot`) and elevation-aligned (`Y=0` / `3` / `6`).
- Ambient forest fireflies stay high (`Y >= 2.0m`) or soft cool-green (`#b6f78e`) so players never mistake them for collectible golden motes (`#ffe58a` at ground pickup level).
- Keep all terrain/flora batched via static `InstancedMesh` (`matrixAutoUpdate = false`) so rendering 500+ props adds minimal draw calls and `atmosphere` turns off cleanly in `benchMode`.

---

### Task 1: Sculpted Terrain & Placement Clearance (`src/client/terrainBuilder.ts`)
- **Tests:** `tests/unit/terrainBuilder.test.ts` (RED -> GREEN):
  - `sampleIslandElevation` returns `0` cleanly at spawn `(0,0,0)` / Night 3 `(0,0,28)`, at every lantern position `L1..L7` (relative to base ground), jump pads, and Night 2 bridge corridor; while returning raised organic multi-layer knolls & shore embankments (`> 0.3m`) in forest sectors/outer rims!
  - `isClearPlayableSpot` rejects coordinates near spawn, lanterns, motes, jump pads, bridge, or direct lantern star-walkways, and accepts deep clearing/rim spots.
  - `buildSculptedIslandMesh` produces valid indexed/non-indexed `BufferGeometry` with finite positions, normals, UVs/colors.

### Task 2: Tropical Flora, Rocks, Grass & Flowers (`src/client/tropicalAssets.ts`)
- **Tests:** `tests/unit/tropicalAssets.test.ts` (RED -> GREEN):
  - Geometry builders for coconut palms, tropical canopy trees, areca palms, wild banana clumps, bamboo clusters, ferns, mossy boulders, small stones, grass tufts, wildflowers, and lotus pads have valid finite vertices, normals, and baked `vertexColors`, within sensible per-instance tri budgets (`<= 320` tris per heavy tree, `<= 90` tris per shrub/rock/flower).
  - Deterministic ecosystem generator produces themed asset counts per night (`Night 1` coastal coconut + canopy, `Night 2` areca + lotus + fern, `Night 3` mountain tree + bamboo + wind-reeds).

### Task 3: Critters & Dynamic Weather Manager (`src/client/atmosphere.ts`)
- **Tests:** `tests/unit/atmosphere.test.ts` (RED -> GREEN):
  - `AtmosphereManager` builds theme-appropriate critters/rain/mist per night (`Night 1` drizzle + moths + canopy fireflies, `Night 2` misty lagoon + cyan dragonflies, `Night 3` wind-angled heavy rain + leaves + storm flash).
  - When `benchMode = true`, weather/critters remain hidden (`count = 0`).
  - When `reduceMotion = true`, lightning intensity boost stays `0` (`no flashes`).
  - `update()` tilts Night 3 rain velocity vector dynamically along `wind.dirDeg` when `wind.active = true` and leaves zero `NaN` transforms.

### Task 4: Scene Integration (`src/client/sceneBuilder.ts` & `src/client/main.ts`) + Full Visual & Contract QA
- Wire sculpted terrain, shoreline islets, cliff buttresses, static flora/rocks/grass/flowers/lotus batches, and `AtmosphereManager` into `IslandScene` (`reduceMotion` & `benchMode` passed in `RenderSyncOptions`).
- Run `npm run build && npm run verify`, verify 3D screenshots across **Night 1 (Đảo Bến)**, **Night 2 (Đảo Cau & cầu tre đầm sen)**, and **Night 3 (Đảo Chuông & mưa bão)** via Electron `read_file` inspection, plus verify clean 30s `bench.mjs`!
- Commit cleanly on `feat/upgrade-3d-models`.
