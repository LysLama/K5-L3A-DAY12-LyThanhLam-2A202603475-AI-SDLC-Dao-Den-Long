# 3D Character & Monster Model Upgrades Implementation Plan

> **For agentic workers:** Executing natively on branch `feat/upgrade-3d-models` using TDD + visual verification while preserving `main`, tag `phase-4`, and Release `v1.0.0`.

**Goal:** Upgrade the 3D models and poses of **Mây** (fixing upward stub arms into natural shoulder-pivoted sleeves, hands, and bamboo-staff lantern carriage), **Bóng Mực / Shades** (organic hunched clawed shadow wraiths with recessed glowing eyes & chest fissures), and **Gió Lạc / Drifters** (horned icy gale-wraiths with tattered wing-fins, swirling cyclone rings, and tapered serpentine tails) without degrading `1280×720` benchmark performance (`>= 60 FPS` for 200 Shades).

**Architecture:** Extract pure Three.js geometry/rig builders into `src/client/characterModels.ts` (`buildMayRigParts`, `buildShadeGeometries`, `buildDrifterVisualGroup`), test their vertex/color/normal/bounding invariants deterministically in Vitest (`tests/unit/characterModels.test.ts`), wire them cleanly into `src/client/sceneBuilder.ts`, then run `npm run verify`, `node dist-app/bench.mjs`, and visual Electron/Browser screenshot checks (`read_file`).

**Tech Stack:** TypeScript, Three.js `0.187.0` (`BufferGeometryUtils.mergeGeometries`, `InstancedMesh`, `MeshLambertMaterial`), Vitest `5.1.1`, Electron `45.4.1` WebGL/OpenGL benchmark & screenshot inspection.

## Global Constraints
- **Phase 4 / Git Tag Sanctity:** Work ONLY on branch `feat/upgrade-3d-models`; NEVER modify `main`, `phase-1..phase-4`, `v1.0.0`, or `upstream`.
- **Headless Parity (`Contract v1.3`):** Zero edits to `src/sim/`, `src/headless/`, or `game.contract.json`.
- **Benchmark Budget (`bench_cmd`):** Maintain `200` Shades on Night 1 (`1280×720`) well above `avg_fps >= 60` and `p1_low_fps >= 30` (keep Shade combined geometry triangle count `<= 900` tris/instance and max `4` static/animated `InstancedMesh` draws across all 200 Shades + stun/drain auxiliaries).

## Review Focus
- Mây's left/right arm geometry must extend **downward** (`y <= 0.08` above shoulder origin `0,0,0` in local arm space) so shoulder rotation swings arms naturally rather than rotating capsules around chest midpoints.
- Mây's bamboo lantern handle & `lanternMount` anchor in `mayLeftArm` must keep `mayLanternPivot` cleanly outside the skirt (`radius > 0.38`) and below the nón lá brim without clipping through the hat or cloak.
- `mergeParts` with `colorizeGeo` strips mismatched `uv` attributes before merging so `BufferGeometryUtils.mergeGeometries` never returns `null` when mixing `LatheGeometry`, `ConeGeometry`, `CylinderGeometry`, `CapsuleGeometry`, and `OctahedronGeometry`.
- All `InstancedMesh` matrices/colors (`shadeClawInst` included) stay pre-allocated at construction time (`MAX_INST_SHADES = 256`) with `frustumCulled = false` and proper disposal on scene cleanup.
- Gió Lạc dynamic disposal (`disposeObjectResources`) frees every child mesh/ring/tail/fin cleanly when a Drifter despawns.

---

### Task 1: Pure 3D Geometry Helpers & Mây Articulated Rig (`src/client/characterModels.ts`)

**Files:**
- Create: `src/client/characterModels.ts`
- Test: `tests/unit/characterModels.test.ts`

- [ ] **Step 1: Write failing tests for `colorizeGeo`, `mergeParts`, and `createMayArmGroup` / `createMayBodyGeometry`**
  Assert:
  - Mây arm group has downward-extending sleeve + cuff + hand (`Box3` min `y < -0.32`, max `y <= 0.085` around shoulder pivot `y=0`), and lantern-bearing left arm includes bamboo staff + non-zero `lanternMount` offset `[x, y, z]` away from torso/skirt (`Math.hypot(x, z) >= 0.34`).
  - Merged body geometry includes `position`, `normal`, and `color` attributes with zero `NaN` values.
- [ ] **Step 2: Run Vitest on `tests/unit/characterModels.test.ts` -> expect FAIL** (module missing).
- [ ] **Step 3: Implement `src/client/characterModels.ts` helpers & Mây builders (`createMayBodyGeometry`, `createMayArmGroup`, `createMayLanternModel`)** -> green tests.
- [ ] **Step 4: Re-run `npx vitest run tests/unit/characterModels.test.ts` -> PASS.**

---

### Task 2: Menacing Bóng Mực (Shade) & Haunting Gió Lạc (Drifter) Builders (`src/client/characterModels.ts`)

**Files:**
- Modify: `src/client/characterModels.ts`
- Modify: `tests/unit/characterModels.test.ts`

- [ ] **Step 1: Add failing tests for `buildShadeGeometries()` and `createDrifterModel()`**
  Assert:
  - `buildShadeGeometries()` returns `{ bodyGeo, clawGeo, eyeGeo, wispGeo }`:
    - `bodyGeo` (`<= 500` tris), `clawGeo` (`<= 350` tris, `Box3` min/max shows claws reaching forward `+Z > 0.45` and spread `±X`), `eyeGeo` (slanted eyes + chest core fissure), `wispGeo` (6 tendrils swirling at lower base).
    - Zero `NaN` in all position/normal/color buffers.
  - `createDrifterModel()` returns `{ group, bodyMat, coreRing, outerRing, finLeft, finRight, trailSegments, stolenOrbs }`:
    - `trailSegments.length >= 6`, tapering monotonically in width/scale toward the tip; vortex rings & tattered wing fins attached cleanly; total mesh tris `<= 1,600`.
- [ ] **Step 2: Run `npx vitest run tests/unit/characterModels.test.ts` -> FAIL.**
- [ ] **Step 3: Implement `buildShadeGeometries()` and `createDrifterModel()` in `src/client/characterModels.ts`.**
- [ ] **Step 4: Run `npx vitest run tests/unit/characterModels.test.ts` -> PASS.**

---

### Task 3: Integrate Upgraded Models & Animations into `src/client/sceneBuilder.ts`

**Files:**
- Modify: `src/client/sceneBuilder.ts`

- [ ] **Step 1: Import `colorizeGeo`, `mergeParts`, `buildShadeGeometries`, `createDrifterModel`, `createMayArmGroup`, `createMayBodyGeometry`, `createMayLanternModel` into `src/client/sceneBuilder.ts`**, removing duplicated inline geometry sculpting.
- [ ] **Step 2: Wire `mayLeftArm` (`Group` holding bamboo pole + `mayLanternPivot` attached at `lanternMount`) and `mayRightArm` (`Group`), plus subtle shoulder/arm walk/dash/idle animation in `sync()`.**
- [ ] **Step 3: Wire upgraded `shadeBodyInst` (`MeshLambertMaterial` + subtle eerie emissive), `shadeClawInst` (lunging/drooping animation per Shade state!), `shadeEyeInst` (fierce eyes + chest fissure), `shadeWispInst`, and upgraded `DrifterVisual` animation (tapered serpentine ribbon wave, flapping tattered fins, counter-spinning vortex rings).**
- [ ] **Step 4: Run `npm run build && npm test` -> all `14` test files PASS.**

---

### Task 4: Visual Screenshot QA + Contract Benchmark + Full Verify Gate

**Files:**
- None (verification artifacts written to scratch dir `%TEMP%/...` / `<ArtifactDir>/scratch/` and deleted if temp bench output)

- [ ] **Step 1: Run `npm run verify`** -> confirm **ALL 7/7 checks pass** (`src/sim/` parity untouched).
- [ ] **Step 2: Run `node dist-app/bench.mjs --seed 42 --duration 10 --out C:/Users/thanh/.../scratch/bench_upgraded.json`** -> verify `avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000` with upgraded 200-Shade claws & sculpted bodies!
- [ ] **Step 3: Launch real Electron WebGL scene (`open` Night 1, Night 2 with Gió Lạc, Night 3 closeup) into `<ArtifactDir>/scratch/preview_*.png` and inspect EVERY screenshot directly with `read_file`** to confirm:
  - Mây's arms hang & swing naturally with proper áo dài sleeves, hands, and left-hand lantern bamboo staff (zero upward nubs!).
  - Bóng Mực looks noticeably scarier, organic, hunched, clawed, and ominous (front & side closeups!).
  - Gió Lạc looks like a genuine swirling spectral gale banshee with horns, tattered wing fins, cyclone rings, and tapered tail!
- [ ] **Step 4: Commit cleanly on `feat/upgrade-3d-models`** and report branch, benchmark numbers, and before/after visual verification concisely to the user.
