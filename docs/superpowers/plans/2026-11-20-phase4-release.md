# Phase 4 Release & Contract v1.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver **TICKET-04 ("Bình minh: phát hành v1.0.0")** with Contract `v1.3` (`bench_cmd`, `soak_cmd`), GPU-instanced Night 1 200-shade benchmark (`avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`), 10-night memory-safe soak runner (`crashes = 0`, `mem_end_mb <= 1.2 * mem_start_mb`), persistent disk leaderboard + `--export-leaderboard`, complete accessibility (9-action key remapping with conflict alert + reset, visual captions & off-screen shade/warning indicators, reduce motion, `>= 18px` base UI font + `×1.25` large text), packaging (`<= 3` install commands, Docker + zip release assets), demo `.mp4` (`< 5` min), 4-phase Retro, `phase-4` tag, and GitHub Release `v1.0.0`.

**Architecture:**
- Pure simulation (`src/sim/`) stays strictly decoupled (no `three`/DOM/`fs`). An isolated `createBenchWorld(seed)` initializer creates the 200-shade / 100-mote / L1–L3 bench state with `benchMode: true`, and `src/sim/soak.ts` executes N rotating Nights cleanly in one process with deterministic seeded inputs.
- Shared domain rules for Contract `v1.3` validation, benchmark statistics (`avg_fps`, `p1_low_fps`, `frame_ms_p95`), and leaderboard normalization/sorting/name validation (`src/shared/leaderboard.ts`, `src/shared/benchStats.ts`) are shared across tests, Node CLI (`src/app/`), and client UI (`src/client/`).
- GPU `THREE.InstancedMesh` batching replaces per-actor Mesh Groups for Shades and Motes inside `src/client/sceneBuilder.ts`, keeping full Night 1 visuals/bloom while minimizing draw calls.
- Node launcher (`dist-app/run.mjs`) serves static `dist/` + `/api/leaderboard` disk store (`~/.dao-den-long/leaderboard.json` or `DDL_LEADERBOARD_PATH`) and handles `--export-leaderboard <file>`. Electron (`dist-app/bench.mjs` + `electron-bench.cjs`) opens an exact `1280×720` non-fullscreen window with VSync switches and multi-process RSS metrics (`peak_mem_mb`).

**Tech Stack:** TypeScript 7, Three.js `0.187.0`, Vite 8, esbuild, Vitest 5, Node `>= 20`, Electron, `ffmpeg-static` (dev/demo encoding), GitHub CLI `gh`.

**Spec:** [`2026-11-20-phase4-release-design.md`](../specs/2026-11-20-phase4-release-design.md)

## Global Constraints
- `contract_version: "1.3"`, adding `"bench_cmd": "node dist-app/bench.mjs"` and `"soak_cmd": "node dist-app/soak.mjs"`, updating `"run_cmd": "node dist-app/run.mjs"`; all v1.0–v1.2 rules & `headless_cmd` behavior preserved.
- Pure simulation boundary (`src/sim/`): zero `three`, DOM, `fs`, `process`, `Math.random()`, or `Date.now()`.
- Clean repo clone runs game in max 3 commands (`git clone ...`, `npm ci && npm run build`, `npm run start`).
- Accessibility minimum UI font size `>= 18px` at `1280×720` (and `×1.25` option), zero silent keybinding conflicts, never break top HUD / layout at `1280×720`.
- Never commit `.env`/tokens; never push to `upstream` (`VinUni-AI20k`); only `origin` (`LysLama`).

## Review Focus
1. **Leaderboard tie-break & injection/invalid names:** Empty/too-short (`< 3`), too-long (`> 12`), disallowed symbols (`<script>`), or equal `score` with differing `achieved_at` timezone offsets -> must validate strictly and sort older timestamps first on score ties (`Task 1`).
2. **Bench `p1_low_fps` & `frame_ms_p95` edge cases:** Small frame count (`N = 1`), zero/tiny `dt` clamps, or exact `95th` percentile calculation vs `Math.ceil(0.01 * N)` -> pinned by exact formula unit tests (`Task 1`, `Task 4`).
3. **Remap keybinding conflicts & stuck movement keys:** Binding `KeyE` to both `interact` and `jump`, or pressing `Space`/`ShiftLeft` then opening settings without reload -> must flag duplicate immediately, reject overwrite, support reset to defaults, and map `ShiftLeft`/`ShiftRight` cleanly (`Task 5`).
4. **Bench camera orbit handedness & entity count:** Night 1 bench must have exact `shades.length === 200`, `motes.length === 100`, `L1..L3` lit `fuel=100`, `L4..L5` unlit, Mây frozen at `[0,0,0]`, NO fuel decay/pickups/damage, and CCW top-down orbit `(30, 15, 0) -> (0, 15, -30)` over `15s` (`Task 2`, `Task 4`).
5. **Clean-clone & packaged Release verification:** Running `run.mjs --export-leaderboard` on a fresh machine with NO pre-existing `~/.dao-den-long/leaderboard.json` file must NOT throw `ENOENT`, and must output valid `{"entries": []}` (`Task 3`, `Task 7`).

---

### Task 1: Contract v1.3, Shared Domain Helpers (`leaderboard`, `benchStats`), and Build Pipeline

**Files:**
- Modify: `game.contract.json`
- Modify: `src/sim/constants.ts:1-8`
- Create: `src/shared/leaderboard.ts`
- Create: `src/shared/benchStats.ts`
- Modify: `package.json`, `scripts/build-headless.mjs` (or create `scripts/build-app.mjs`)
- Test: `tests/unit/leaderboard.test.ts`, `tests/unit/benchStats.test.ts`, `tests/unit/world.test.ts`

**Interfaces:**
- Produces `src/shared/leaderboard.ts`:
  - `export interface LeaderboardEntry { name: string; score: number; nights_won: number; achieved_at: string; seed: number; }`
  - `export function validatePlayerName(raw: string): { valid: boolean; normalized: string; error?: string }`
  - `export function formatIsoWithTimezone(date?: Date): string`
  - `export function sortAndTrimLeaderboard(entries: readonly LeaderboardEntry[]): LeaderboardEntry[]`
  - `export function addLeaderboardEntry(entries: readonly LeaderboardEntry[], candidate: Omit<LeaderboardEntry, 'achieved_at'> & { achieved_at?: string }): LeaderboardEntry[]`
- Produces `src/shared/benchStats.ts`:
  - `export interface BenchMetricsInput { dtsMs: number[]; loadMs: number; peakMemMb: number | null; vsyncOff: boolean; renderer: string; os: string; }`
  - `export function computeBenchMetrics(input: BenchMetricsInput): BenchOutput`

- [ ] **Step 1: Write failing unit tests for `leaderboard.ts`, `benchStats.ts`, and `Contract v1.3` (`tests/unit/leaderboard.test.ts`, `tests/unit/benchStats.test.ts`, `tests/unit/world.test.ts`)**
  - Test valid ASCII (`Mây_01`, `Lam_2026`) & invalid names (`"ab"`, `"1234567890123"`, `"bad<tag>"`).
  - Test sorting: descending `score`, earlier `achieved_at` (including mixed timezone strings `+07:00` vs `Z`) wins ties, trimmed to max `10`.
  - Test `computeBenchMetrics`: verify exact `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `frames`, and `contract_version: "1.3"`.
  - Update `tests/unit/world.test.ts` to expect `contract.contract_version === '1.3'`.
- [ ] **Step 2: Run Vitest to confirm RED failure**
  - Run: `npx vitest run tests/unit/leaderboard.test.ts tests/unit/benchStats.test.ts`
- [ ] **Step 3: Implement `src/shared/leaderboard.ts`, `src/shared/benchStats.ts`, update `game.contract.json` (`1.3`, `bench_cmd`, `soak_cmd`, `run_cmd`), and update build scripts (`npm run build` compiles Vite + `dist-headless/cli.mjs` + `dist-app/{run,bench,soak}.mjs` + `dist-app/electron-bench.cjs`)**
- [ ] **Step 4: Run Vitest & `tsc --noEmit` to confirm GREEN**
- [ ] **Step 5: Commit Task 1**

---

### Task 2: Bench Simulation (`createBenchWorld`), Night 1 Bench Orbit & `src/sim/soak.ts`

**Files:**
- Modify: `src/sim/types.ts` (add optional `benchMode?: boolean` on `SimState` — NOT serialized into headless snapshots/events)
- Modify: `src/sim/world.ts` (add `export function createBenchWorld(seed: number): SimState`)
- Modify: `src/sim/step.ts` (short-circuit decay/spawn/pickups/contacts/chase/win-loss when `state.benchMode === true`, keeping Shades moving in `wander` around safe zones)
- Create: `src/sim/soak.ts` (`export interface SoakResult`, `export function runSoak(options: { seed: number; nights: number; getRssMb: () => number }): SoakOutput`)
- Test: `tests/unit/benchWorld.test.ts`, `tests/unit/soak.test.ts`

**Interfaces:**
- Produces:
  - `createBenchWorld(seed: number): SimState`
  - `runSoak({ seed, nights, getRssMb }): SoakOutput` (`nights`, `crashes`, `results`, `mem_start_mb`, `mem_end_mb`, `duration_s`)

- [ ] **Step 1: Write failing tests (`tests/unit/benchWorld.test.ts`, `tests/unit/soak.test.ts`)**
  - Verify `createBenchWorld(42)` produces exactly `200` `wander` shades, `100` motes, `L1..L3` `lit: true, fuel: 100`, `L4..L5` unlit, Mây at `[0,0,0]`, and determinism across two runs.
  - Step `createBenchWorld(42)` for `600` ticks: verify `lanterns[0..2]` stay `fuel === 100`, `shades` stay `200` in `'wander'` and move across island, `motes` stay `100`, `flames` stays `3`, `status === 'playing'`.
  - Verify `runSoak({ seed: 7, nights: 3, getRssMb: ... })` rotates Nights `1 -> 2 -> 3`, generates probabilistic inputs (`5%` jump, `3%` dash, `2%` pulse, `10%` interact, `30`-tick move dir change), `crashes: 0`, and deterministic `results`.
- [ ] **Step 2: Run Vitest to confirm RED failure**
- [ ] **Step 3: Implement `benchMode` in `types.ts` / `world.ts` / `step.ts` and `src/sim/soak.ts`**
- [ ] **Step 4: Run Vitest to confirm GREEN (including full headless test invariance)**
- [ ] **Step 5: Commit Task 2**

---

### Task 3: Node CLI Apps (`src/app/run.ts`, `src/app/soakCli.ts`, `src/app/leaderboardStore.ts`) & Dependencies (`electron`)

**Files:**
- Create: `src/app/leaderboardStore.ts` (`getDefaultLeaderboardPath`, `readLeaderboardFile`, `appendLeaderboardFile`)
- Create: `src/app/run.ts` (HTTP server serving `dist/` + `/api/leaderboard` `GET`/`POST`, `--export-leaderboard <path>`, `--no-open`, `--port`, `--leaderboard-file`)
- Create: `src/app/soakCli.ts` (`--seed <n> --nights <n> --out <soak.json>`)
- Modify: `scripts/build-app.mjs` & `package.json` (`electron` devDependency, `soak`, `bench`, `start` scripts)
- Test: `tests/contract/appCli.test.ts`

- [ ] **Step 1: Write failing integration tests in `tests/contract/appCli.test.ts`**
  - Test `<run_cmd> --export-leaderboard <out.json>` when no file exists yet (`{"entries": []}`) AND after saving multiple entries out of order -> verifies sorted Top 10 & disk persistence across separate CLI runs.
  - Test `<soak_cmd> --seed 7 --nights 3 --out <tmp/soak.json>` produces valid JSON `{ nights: 3, crashes: 0, results: [...], mem_start_mb, mem_end_mb, duration_s }`.
- [ ] **Step 2: Run Vitest to confirm RED**
- [ ] **Step 3: Install `electron` (`npm install -D electron`) and implement `leaderboardStore.ts`, `run.ts`, `soakCli.ts`, `build-app.mjs`, `package.json` scripts**
- [ ] **Step 4: Build & run `tests/contract/appCli.test.ts` to confirm GREEN**
- [ ] **Step 5: Commit Task 3**

---

### Task 4: GPU `InstancedMesh` Rendering, Bench Orbit Mode & Electron Bench Runner (`bench.json` & `soak.json`)

**Files:**
- Modify: `src/client/sceneBuilder.ts` (convert Motes & Shades to preallocated `THREE.InstancedMesh` batches preserving all colors, colorblind `#00B3FF`, `stunned`, `recoil`, `drain`, `drainBeam`, and proper resource disposal)
- Modify: `src/client/main.ts` (detect `?bench=1&seed=42&duration=30`, compute exact CCW orbit `(30*cos(2πt/15), 15, -30*sin(2πt/15))` looking at `[0,0,0]`, collect frame `dts` after `3s` warmup for `duration`s, post/expose `BenchMetricsInput`)
- Create: `src/app/benchCli.ts` & `src/app/electronBench.ts` (`dist-app/bench.mjs` & `dist-app/electron-bench.cjs` — opens `1280×720` non-fullscreen Electron window with `disable-gpu-vsync` & `disable-frame-rate-limit`, serves `dist/`, measures `load_ms` & multi-process `peak_mem_mb`, writes `bench.json` matching `v1.3` schema)
- Test: `tests/unit/benchOrbit.test.ts`

- [ ] **Step 1: Write failing unit tests (`tests/unit/benchOrbit.test.ts`)** for exact CCW camera coordinates at `t = 0` (`[30, 15, 0]`), `t = 3.75` (`[0, 15, -30]`), `t = 7.5` (`[-30, 15, 0]`), `t = 11.25` (`[0, 15, 30]`), `t = 15` (`[30, 15, 0]`).
- [ ] **Step 2: Run Vitest to confirm RED**
- [ ] **Step 3: Implement `benchOrbit.ts` helper, `InstancedMesh` Motes/Shades in `sceneBuilder.ts`, bench loop in `main.ts`, and `benchCli.ts` + `electronBench.ts`**
- [ ] **Step 4: Run `npm run build && npx vitest run tests/unit/benchOrbit.test.ts` AND execute live bench + soak:**
  - `node dist-app/bench.mjs --seed 42 --duration 30 --out bench.json`
  - `node dist-app/soak.mjs --seed 7 --nights 10 --out soak.json`
  - Inspect `bench.json` & `soak.json` directly: confirm `avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`, `crashes = 0`, `mem_end_mb <= 1.2 * mem_start_mb`.
- [ ] **Step 5: Commit Task 4 (`bench.json` + `soak.json` + code)**

---

### Task 5: Full Accessibility Suite (Key Remapper, Visual Captions & Indicators, Reduce Motion, >= 18px UI + x1.25) & Leaderboard UI

**Files:**
- Modify: `src/client/inputMapper.ts` (customizable 9-action keybindings map, conflict detection helper `detectKeyConflict`, code-to-label formatter, Shift normalization, defaults + reset)
- Modify: `src/client/leaderboard.ts` (new client helper syncing `/api/leaderboard` + `localStorage` cache)
- Modify: `src/client/camera.ts` (respect `reduceMotion` flag disabling camera shake & dash FOV kick)
- Modify: `src/client/hud.ts`, `src/client/style.css`, `index.html`, `src/client/main.ts`:
  - **Settings drawer:** add `"Giảm chuyển động"`, `"Chữ lớn (×1.25)"`, interactive **9-action Key Remapper** with conflict alert & `"Khôi phục mặc định"` button, persisted cleanly in `localStorage`.
  - **Visual Captions & Off-screen Indicators:** caption container announcing `shade_spawned` (with edge arrows pointing toward spawned/close Shades!), `wind.warning` ("Gió sắp thổi"), `<= 10s` final countdown, and `fuel < 30` weak lanterns (with directional arrow/indicator).
  - **Minimum 18px Typography & Large Text `×1.25`:** bump all UI CSS font sizes to `>= 18px` at `1280×720` cleanly without wrapping/clipping, add `body.is-large-text` scaling `×1.25` (`>= 22.5px`).
  - **Leaderboard UI:** Main menu button opening Leaderboard Modal (Top 10 table: Rank, Name, Score, Nights Won, Seed, Date); Result screen (after Dawn Victory Night 3 OR any loss) name input (`3–12` chars) + Save Score button saving straight to local disk via `/api/leaderboard`.
- Test: `tests/unit/clientInput.test.ts` (expand with custom bindings, conflict detection, reset), `npm run build` + `impeccable detect`.

- [ ] **Step 1: Write failing tests in `tests/unit/clientInput.test.ts`** covering default bindings, remapped 9 actions (`WASD`, `Space`, `ShiftLeft`, `KeyE`, `KeyQ`, `KeyP`), `detectKeyConflict`, and reset.
- [ ] **Step 2: Run Vitest to confirm RED**
- [ ] **Step 3: Read target sections of `hud.ts`, `camera.ts`, `style.css` -> implement all accessibility & leaderboard features cleanly**
- [ ] **Step 4: Run `vitest`, `npm run build`, `impeccable detect --json`, AND live browser QA at `1280×720`** (assert EVERY visible text element `fontSize >= 18px`, `×1.25 >= 22.5px`, test key remapping conflict warning + reset, test captions/reduce motion, save leaderboard score & confirm `node dist-app/run.mjs --export-leaderboard` exports it cleanly!).
- [ ] **Step 5: Commit Task 5**

---

### Task 6: Verification Gate, Packaging (`Dockerfile`, Release `.zip`), Demo Video (`demo.mp4`), Docs, Retro, Independent Review, PR/Merge, Tag `phase-4`, Release `v1.0.0`

**Files:**
- Modify: `scripts/verify-all.mjs` (add Phase 4 contract `v1.3` checks: leaderboard unit/CLI export check, bench orbit check, soak `10`-night CLI check / smoke soak + Phase 1–3 regression)
- Create: `Dockerfile`, `.dockerignore`, `scripts/package-release.mjs`, `scripts/record-demo.mjs`
- Modify: `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `.github/workflows/ci.yml`
- Modify: `README.md` (video link at very top, `<= 3` install/run commands, bench & soak & export-leaderboard commands, vsync note, system requirements, screenshot/GIF + "Sáng tạo của tôi")
- Modify: `CHANGELOG.md` (Phase 1–4 complete), `CREDITS.md` (Electron, Three.js, Vite, Vitest, esbuild, `ffmpeg-static`, Web Audio, AI), check `LICENSE`
- Create: `docs/notes/phase-4-assumptions.md`, `docs/notes/retro.md` (1–2 pages covering 4-phase evaluation, AI mistakes & fixes, harness impact, token/cost estimates & savings, retrospective changes), update `docs/notes/ai-log.md`, create `docs/proof/phase-4-proof.md`, create/upload `docs/demo/demo.mp4` (`< 5 min`, `< 100 MB`, showing real gameplay + `npm run verify` + `bench` + `soak` + harness/git history)

- [ ] **Step 1: Implement packaging (`Dockerfile`, `scripts/package-release.mjs`) & update `scripts/verify-all.mjs` + `.github/workflows/ci.yml`**
- [ ] **Step 2: Record real demo `.mp4` (`ffmpeg-static` + Chromium/Electron captures of live gameplay, tests/verify, bench/soak, git/harness) -> verify duration `< 300s`, size `< 100 MB`, playable H.264/AAC**
- [ ] **Step 3: Write `README.md`, `CHANGELOG.md`, `CREDITS.md`, `phase-4-assumptions.md`, `retro.md`, `ai-log.md`, `phase-4-proof.md`, `AGENTS.md`, `verify-phase/SKILL.md`**
- [ ] **Step 4: Commit cleanly on `feat/phase-4`, dispatch independent `research` reviewer over `main..HEAD`, resolve any Critical/Important findings cleanly**
- [ ] **Step 5: Run `npm run build && npm run verify`, push `feat/phase-4` -> PR #4 -> merge `main`, re-verify ON `main`, clone-test into clean folder (`git clone` -> `npm ci && npm run build` -> `npm run start -- --no-open --export-leaderboard`), create tag `phase-4` -> push tag -> `gh release create v1.0.0 ...` attaching `dao-den-long-v1.0.0-web.zip` and `demo.mp4`!**
