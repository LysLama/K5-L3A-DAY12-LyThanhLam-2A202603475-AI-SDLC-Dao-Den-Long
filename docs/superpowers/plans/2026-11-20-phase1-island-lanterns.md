# Đảo Đèn Lồng (Phase 1 — Đêm 1: Đảo Bến) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng game 3D playable **Đảo Đèn Lồng (Đêm 1 – Đảo Bến)** bằng TypeScript + Three.js + Node.js headless CLI tuân thủ đầy đủ PRD-0, Test Contract v1.0, AI harness, kiểm chứng tự động và tag `phase-1`.

**Architecture:** Tách biệt hoàn toàn lõi simulation tất định 60Hz (`src/sim/`) khỏi lớp hiển thị 3D, HUD và Web Audio (`src/client/`). `src/sim/` không import DOM, Window hay Three.js, dùng chung bởi cả trình duyệt (`vite` build ra `dist/`) và CLI headless (`esbuild` bundle ra `dist-headless/cli.mjs`).

**Tech Stack:** TypeScript `7.0.2`, Three.js `0.187.0` (`@types/three@0.187.0`), Vite `8.3.8`, Vitest `5.1.1`, esbuild `0.28.2`, Node.js `v22.20.0` (tương thích macOS/Linux Node ≥ 20).

**Spec:** [docs/superpowers/specs/2026-11-20-phase1-design.md](file:///D:/Procj/VinUni/Day12/K5-L3-LAB-Day12-AI-SDLC/docs/superpowers/specs/2026-11-20-phase1-design.md)

## Global Constraints
- Không đẩy nhầm lên `upstream` (`VinUni-AI20k`); chỉ push lên `origin` (`LysLama/K5-L3A-DAY12-LyThanhLam-2A202603475-AI-SDLC-Dao-Den-Long`).
- `game.contract.json` ở gốc repo: `"contract_version": "1.0"`, `"team": "2A202603475-LyThanhLam"`, chạy được trên macOS/Linux sau `build_cmd` (`npm ci && npm run build`).
- Logic 60 tick/giây cố định (`dt = 1/60`), tất định 100% theo `--seed` (cấm `Math.random()`, `Date.now()` trong `src/sim/`).
- Mọi khoảng cách trong `tuning` đo trên mặt phẳng ngang XZ (`Math.hypot(dx, dz) <= r`); tọa độ và `time_left_s` trong JSONL làm tròn 3 chữ số thập phân.
- README chạy game trên clone sạch trong tối đa 3 lệnh; sáng tạo (`src/client/audio.ts`, ánh sáng đảo thức tỉnh) tuyệt đối không ảnh hưởng đầu ra headless.

## Review Focus
1. **Input/Scenario validation (exit 2):** `tick` không tăng nghiêm ngặt (vd trùng hoặc giảm), thành phần `move` ngoài `[-1, 1]`, hay JSON sai schema phải thoát mã `2` kèm thông báo ra `stderr`.
2. **Rising-edge & sparse frame hold:** Giữ `interact: true` nhiều tick liên tiếp chỉ kích hoạt ở sườn `false -> true`; frame thưa giữ nguyên `move`/`cam_yaw_deg` của frame trước.
3. **Same-tick precedence:** `pulse` giải cứu trước khi Bóng Mực chạm gây sát thương; thắp đủ 5 đèn thắng (`all_lit`) ưu tiên hơn hết giờ (`dawn`) nếu xảy ra cùng tick cuối.
4. **Overlapping `safe_radius` & collinear tangent:** Khi Bóng Mực nằm thẳng hàng sau Đèn Lồng sáng đối diện Mây (`cross === 0`), trượt tiếp tuyến chọn `+1` CCW tất định và kẹp `>= safe_radius` qua 2 lượt cho đèn chồng vùng.
5. **Client parity & Retry lifecycle:** Input trình duyệt dùng cùng phép xoay `cam_yaw_deg` với headless; nhấn "Chơi lại" reset sạch state, mesh, audio và không rò rỉ vòng `requestAnimationFrame`.

---

### Task 1: Project Scaffolding, `game.contract.json`, AI Harness & CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `game.contract.json`, `.gitignore`, `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `.github/workflows/ci.yml`, `docs/lab/LAB_README.md`, `tests/smoke.test.ts`
- Modify: none (archive original `README.md` to `docs/lab/LAB_README.md` first)

**Interfaces:**
- Produces: `npm run build` (`tsc --noEmit && vite build && node scripts/build-headless.mjs` or inline esbuild script), `npm test` (`vitest run`), `npm run start` (`vite preview --host 127.0.0.1 --port 4173 --open`), `node dist-headless/cli.mjs` entry target.

- [ ] **Step 1: Archive course prompt README & write `game.contract.json`, `.gitignore`, `tsconfig.json`, `vite.config.ts`, `package.json`**
  Copy existing `README.md` to `docs/lab/LAB_README.md`. Create `package.json` (`"type": "module"`) with scripts `dev`, `build`, `start`, `test`, `verify`, plus dependencies `three@0.187.0` and devDependencies `@types/three@0.187.0`, `@types/node@^22.15.0`, `esbuild@0.28.2`, `typescript@7.0.2`, `vite@8.3.8`, `vitest@5.1.1`. Write `game.contract.json` matching Spec Section 3.A verbatim.
- [ ] **Step 2: Write AI harness (`AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`) and GitHub CI (`.github/workflows/ci.yml`)**
  Keep `AGENTS.md` under 50 lines (build/test/headless commands, pure `src/sim/` boundary, no `Math.random()`, mandatory `npm run verify`).
- [ ] **Step 3: Install npm dependencies and create `tests/smoke.test.ts`**
  ```ts
  import { describe, it, expect } from 'vitest';
  import contract from '../game.contract.json';
  describe('contract smoke', () => {
    it('declares v1.0 contract and Night 1 lantern count 5', () => {
      expect(contract.contract_version).toBe('1.0');
      expect(contract.tuning.lantern_count_night1).toBe(5);
    });
  });
  ```
- [ ] **Step 4: Run `npm install` and `npm test` to verify toolchain**
  Run: `npm install && npm test`
  Expected: PASS (`1 passed`), `node_modules/` ignored by `.gitignore`.
- [ ] **Step 5: Commit**
  ```bash
  git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts game.contract.json AGENTS.md .agents .github docs/lab tests/smoke.test.ts docs/superpowers
  git commit -m "chore: scaffold project, Test Contract v1.0 config, AI harness and CI"
  ```

---

### Task 2: Core Simulation Types, Seeded PRNG, Constants & Scenario World Builder

**Files:**
- Create: `src/sim/types.ts`, `src/sim/rng.ts`, `src/sim/constants.ts`, `src/sim/world.ts`
- Test: `tests/unit/world.test.ts`

**Interfaces:**
- Consumes: `game.contract.json` tuning values (mirrored in `src/sim/constants.ts`).
- Produces:
  - `src/sim/types.ts`: `Vec3`, `GameStatus`, `InputState`, `InputFrame`, `ScenarioConfig`, `LanternState`, `MoteState`, `ShadeState`, `SimEvent`, `SimSnapshot`, `SimEnd`, `SimState`.
  - `src/sim/rng.ts`: `createRng(seed: number): () => number` (Mulberry32 deterministic PRNG).
  - `src/sim/constants.ts`: `TUNING`, `DEFAULT_LANTERN_POSITIONS`, `ISLAND_RADIUS = 36`, `FOG_BOUND_RADIUS = 45`, `DT = 1 / 60`.
  - `src/sim/world.ts`: `createWorld(seed: number, scenario?: ScenarioConfig): SimState`, `round3(n: number): number`, `buildSnapshot(state: SimState): SimSnapshot`.

- [ ] **Step 1: Write failing unit tests in `tests/unit/world.test.ts`**
  Cover:
  1. Default Night 1 world creates `5` unlit lanterns `L1..L5` at `R = 22`, `28` motes (`M1..M28`), `3` chase shades (`S1..S3`) at `Y = 1.0`, `flames = 3`, `time_left_s = 240`, identical across two calls with same `seed`.
  2. `scenario` merges `lanterns` by `id` (preserving unmentioned lanterns), sets `lit: true` with `0` score and `0` events, replaces `motes` (`[[0,0,5]]` -> `M1`) and `shades`, respects `random_motes: false` / `random_shades: false`, and avoids ID collision when `scenario` supplies `S1` or `S5`.
  3. `TUNING` in `src/sim/constants.ts` equals `game.contract.json` `tuning` deeply.
- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run tests/unit/world.test.ts`
  Expected: FAIL (`Cannot find module '../../src/sim/world'`).
- [ ] **Step 3: Implement `types.ts`, `rng.ts`, `constants.ts`, `world.ts`**
  Keep each module small and strictly free of DOM/Node/Three imports. Ensure `nextMoteSeq` / `nextShadeSeq` compute max existing numeric suffix + 1.
- [ ] **Step 4: Run tests and verify pass**
  Run: `npx vitest run tests/unit/world.test.ts`
  Expected: PASS (all cases).
- [ ] **Step 5: Commit**
  ```bash
  git add src/sim/types.ts src/sim/rng.ts src/sim/constants.ts src/sim/world.ts tests/unit/world.test.ts
  git commit -m "feat(sim): add deterministic PRNG, tuning constants, types and scenario world builder"
  ```

---

### Task 3: Fixed-Tick Simulation Pipeline (`stepTick`)

**Files:**
- Create: `src/sim/step.ts`
- Test: `tests/unit/step.test.ts`

**Interfaces:**
- Consumes: `SimState`, `InputState`, `SimEvent` (`src/sim/types.ts`), `TUNING`, `ISLAND_RADIUS`, `FOG_BOUND_RADIUS`, `DT` (`src/sim/constants.ts`).
- Produces: `stepTick(state: SimState, input: InputState): SimEvent[]` (mutates `state` in place for 1 tick `1/60s` and returns events generated on `tick = state.sim_tick`).

- [ ] **Step 1: Write failing unit tests in `tests/unit/step.test.ts`**
  Include explicit tests for all mechanics + Review Focus edge cases #2, #3, #4:
  1. `move` + `cam_yaw_deg` (`0°`, `90°`, `180°`) and diagonal `[1, 1]` normalization (`dist === 7.0 / 60`).
  2. Rising-edge hold: `interact: true` held for 3 consecutive ticks triggers `deposit` only once; sparse frame change preserves previous `move` / `cam_yaw_deg`.
  3. Jump (`vy = 6.5`, `g = -18`) lands back at `Y = 0` inside `R = 36`; walking off edge `r > 36` drops below `Y <= -4.0`, triggers `player_hit {"by":"fall"}` (even during `invuln_remaining > 0`), halves carried (`Math.floor(carried * 0.5)` including `1 -> 0`), respawns at `(0,0,0)`.
  4. `mote_picked` enforces `carry_capacity = 10` and `pickup_radius = 1.8`.
  5. `pulse` (`cost = 2`, `radius = 7.5`, `push = 5.0`, `stun = 2.5`) triggers BEFORE shade contact in the same tick, rescuing Mây when a shade is already inside `1.2m` at tick start!
  6. `deposit` -> `lantern_lit` -> `all_lit`: lighting the 5th lantern on the exact tick `time_left_s` hits `0` produces `"won"` (`"all_lit"`), NOT `"dawn"`, and adds `Math.floor(time_left_s) * 5 + flames * 100`.
  7. `safe_radius` (`5.5m`) 2-pass pushout + deterministic `+1` CCW tangential tie-break when shade-lantern-player are collinear (`cross === 0`), and `shade` contact reducing `flames` to `0` emits `game_over {"result":"lost","reason":"no_flames"}` and makes subsequent `stepTick` calls no-op.
- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run tests/unit/step.test.ts`
  Expected: FAIL (`Cannot find module '../../src/sim/step'`).
- [ ] **Step 3: Implement `stepTick(state: SimState, input: InputState): SimEvent[]` in `src/sim/step.ts`**
  Follow the exact 10-step intra-tick order in Spec Section 4. Extract clean pure helpers (`applySafeRadius`, `distXZ`, `resolveMoveVector`).
- [ ] **Step 4: Run tests and verify pass**
  Run: `npx vitest run tests/unit/step.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/sim/step.ts tests/unit/step.test.ts
  git commit -m "feat(sim): implement deterministic 60Hz stepTick pipeline and collision rules"
  ```

---

### Task 4: Simulation Runner, Schema Validators & Headless CLI

**Files:**
- Create: `src/sim/runner.ts`, `src/headless/validate.ts`, `src/headless/cli.ts`, `scripts/build-headless.mjs`
- Test: `tests/contract/headless.test.ts`

**Interfaces:**
- Consumes: `createWorld`, `buildSnapshot` (`world.ts`), `stepTick` (`step.ts`), `InputFrame`, `ScenarioConfig` (`types.ts`).
- Produces:
  - `src/sim/runner.ts`: `runSimulation(opts: { seed: number; ticks: number; snapshotEvery: number; scenario?: ScenarioConfig; frames?: InputFrame[] }): string[]` (returns JSONL lines).
  - `src/headless/validate.ts`: `parseAndValidateInputs(rawJson: string): InputFrame[]`, `parseAndValidateScenario(rawJson: string): ScenarioConfig` (throws `ContractValidationError` mapped to exit code `2`).
  - `dist-headless/cli.mjs` built via `scripts/build-headless.mjs` using `esbuild`.

- [ ] **Step 1: Write failing contract tests in `tests/contract/headless.test.ts`**
  Include Review Focus #1 tests + full CLI checks via `child_process.execFileSync`:
  1. Exit code `2` + stderr message on: malformed JSON, duplicate tick (`[0, 0]`), decreasing tick (`[5, 3]`), out-of-range `move` (`[1.5, 0]`), wrong `scenario.player.pos` length.
  2. Exit code `1` on `--night 2` or missing required `--out`.
  3. Snapshot tick `0` emitted BEFORE tick `0` input, events stamped at `k + 1`, coordinates & `time_left_s` rounded to 3 decimals, ends immediately on `"won"`/`"lost"` with final `{"type":"end", ...}` line.
  4. Determinism check: running `node dist-headless/cli.mjs --seed 42 --night 1 --ticks 600` twice produces byte-for-byte identical `.jsonl` output.
- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run tests/contract/headless.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement `src/sim/runner.ts`, `src/headless/validate.ts`, `src/headless/cli.ts`, `scripts/build-headless.mjs`**
  Wire `npm run build` in `package.json` to run `tsc --noEmit && vite build && node scripts/build-headless.mjs`.
- [ ] **Step 4: Build and run contract tests**
  Run: `npm run build && npx vitest run`
  Expected: PASS (all unit + contract tests, exit codes & determinism verified).
- [ ] **Step 5: Commit**
  ```bash
  git add src/sim/runner.ts src/headless/validate.ts src/headless/cli.ts scripts/build-headless.mjs package.json tests/contract/headless.test.ts
  git commit -m "feat(headless): implement Test Contract v1.0 runner, strict validators and CLI"
  ```

---

### Task 5: Three.js 3D Island Client, Mây Character, HUD & Creative Audio

**Files:**
- Create: `index.html`, `src/client/style.css`, `src/client/camera.ts`, `src/client/audio.ts`, `src/client/sceneBuilder.ts`, `src/client/hud.ts`, `src/client/main.ts`, `src/client/inputMapper.ts`
- Test: `tests/unit/clientInput.test.ts`

**Interfaces:**
- Consumes: `createWorld`, `stepTick`, `TUNING`, `ISLAND_RADIUS`, `DT` from `src/sim/`.
- Produces:
  - `src/client/inputMapper.ts`: `mapKeysToInput(pressedKeys: Set<string>, prevButtons: { jump: boolean; interact: boolean; pulse: boolean }, camYawDeg: number): InputState` (tested for parity with Test Contract C).
  - Full playable 3D web game built into `dist/` and launched via `npm run start`.

- [ ] **Step 1: Write failing parity test in `tests/unit/clientInput.test.ts`**
  Pin Review Focus #5: test `W/A/S/D`, `Space`, `E/F`, `Shift/R` mapping and `cam_yaw_deg` wrapping cleanly into `InputState` (`W` -> `move: [0, 1]`, `D` -> `move: [1, 0]`, diagonal normalized by `stepTick`).
- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run tests/unit/clientInput.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement `inputMapper.ts`, `camera.ts`, `audio.ts`, `sceneBuilder.ts`, `hud.ts`, `main.ts`, `index.html`, `style.css`**
  - `sceneBuilder.ts`: Circular island (`R = 36m`) with warm rim stones, floating cloud sea underneath, stylized Mây wearing **nón lá** + swinging warm orange-gold lantern (`PointLight`), 5 Great Lanterns with glowing progress & visible `safe_radius` (`5.5m`) ground rings when lit, bobbing golden fireflies, purple-black Ink Shades with glowing violet eyes & stunned golden sparks, expanding Pulse wave ring, twilight-to-warmth lighting progression + glowing spirit crystals around lit lanterns.
  - `main.ts`: Fixed `1/60s` accumulator calling `stepTick`, clean `dispose()` / reset handler on "Chơi lại" (zero leaked `requestAnimationFrame` loops).
  - `audio.ts`: Procedural Web Audio chimes on `mote_picked`, warm chord on `lantern_lit`, whoosh chime on `pulse`, gentle warning tone on `player_hit` (with `M` mute toggle, gracefully skipped if `AudioContext` unavailable).
- [ ] **Step 4: Run `npm run build && npm test` and verify client bundle**
  Run: `npm run build && npm test`
  Expected: PASS (`tsc --noEmit` 0 errors, `vite build` creates `dist/`, `dist-headless/cli.mjs` rebuilt, all unit + contract tests pass).
- [ ] **Step 5: Commit**
  ```bash
  git add index.html src/client tests/unit/clientInput.test.ts
  git commit -m "feat(client): build Three.js 3D island world, May with non la lantern, HUD and audio"
  ```

---

### Task 6: Verification Gate, Phase 1 Proof Artifacts, README, Notes & Tag `phase-1`

**Files:**
- Create: `scripts/verify-all.mjs`, `README.md`, `CREDITS.md`, `LICENSE`, `docs/notes/phase-1-assumptions.md`, `docs/notes/ai-log.md`, `docs/proof/phase-1-proof.md`, `docs/proof/phase1-scenarios/*.json`

**Interfaces:**
- Consumes: `game.contract.json`, `dist-headless/cli.mjs`, `npm test`, `npm run build`.
- Produces: `npm run verify` single-command full verification gate + reproducible Phase 1 evidence.

- [ ] **Step 1: Create `scripts/verify-all.mjs` & saved scenario files in `docs/proof/phase1-scenarios/`**
  `scripts/verify-all.mjs` checks: (1) `game.contract.json` schema & sync with `TUNING`, (2) `npx vitest run`, (3) headless playthrough scenario winning all 5 lanterns, (4) headless loss scenarios (`no_flames` & `dawn`), (5) byte-for-byte determinism check (`--seed 42` run twice). Exits non-zero on any failure.
- [ ] **Step 2: Write `README.md`, `CREDITS.md`, `LICENSE`, `docs/notes/phase-1-assumptions.md`, `docs/notes/ai-log.md`, `docs/proof/phase-1-proof.md`**
  - `README.md`: ≤ 3 commands to install & run on macOS/Linux (`git clone ...`, `npm ci && npm run build`, `npm run start`), controls, exact scoring formula, headless CLI usage, `"Sáng tạo của tôi"` section with proof that headless output is unaffected.
  - `docs/proof/phase-1-proof.md`: Traceability matrix mapping every PRD-0 & Test Contract requirement → verification command → real observed output → PASS/FAIL.
- [ ] **Step 3: Run `npm run build && npm run verify`**
  Run: `npm run build && npm run verify`
  Expected: PASS (0 failures, all saved scenario JSONLs generated from current code).
- [ ] **Step 4: Independent Verification & Browser Playtest**
  - Verify live 3D game in browser (`vite preview` + `browser` subagent checking canvas renders, HUD visible, controls move Mây without console errors).
  - Dispatch fresh reviewer subagent to audit the repo against PRD-0 + Test Contract v1.0 + `RUBRIC.md`.
- [ ] **Step 5: Commit, tag `phase-1`, verify clean clone, and push to `origin`**
  ```bash
  git add scripts README.md CREDITS.md LICENSE docs/notes docs/proof package.json
  git commit -m "docs: add Phase 1 README, assumptions, AI log, proof and verification gate"
  git tag phase-1
  git push origin main
  git push origin phase-1
  ```

---

## Self-Review Results
- **Spec coverage:** Every section of `docs/superpowers/specs/2026-11-20-phase1-design.md` (stack, `game.contract.json`, CLI & exit codes, `inputs` & `scenario` schemas, JSONL output, 10-step intra-tick order, PRD-0 client visuals/controls/HUD, creative scope, AI harness, docs/proof) maps directly to Tasks 1–6.
- **Step scan:** Every step specifies concrete files, interfaces, assertions, and verification commands without placeholder instructions.
- **Type consistency:** `createWorld`, `stepTick`, `runSimulation`, `parseAndValidateInputs`, `parseAndValidateScenario`, `mapKeysToInput`, `SimState`, `InputState` match consistently across task boundaries.
- **Review Focus:** All 5 edge-case failure modes are pinned to explicit tests in Tasks 3, 4, and 5.
