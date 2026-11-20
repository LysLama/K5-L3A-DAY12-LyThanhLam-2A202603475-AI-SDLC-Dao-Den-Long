# Phase 3 Implementation Plan ("Đèn cạn dầu" · Contract v1.2)

> **For agentic workers:** Execute task-by-task following strict TDD (RED → GREEN), frequent commits, and keeping `src/sim/` 100% pure (zero DOM/Three/Node APIs, zero floats for fuel accumulator).

**Goal:** Implement TICKET-03 (`Contract v1.2`) across simulation, headless CLI/validator, 3D visuals (fuel bars, 1 Hz blink, torn/deflated unlit lanterns, drain beam, colorblind palette), HUD (`capacity` slots, warning `⚠` mode, settings toggle), verification gate, and proof docs.

**Architecture:** Use integer `fuelTicks` (`1/60` fuel units, `0..6000`) inside `LanternState`, extend `stepTick` Step 2/4/5/6/7/8/11 cleanly per TICKET-03 order, update `validate.ts`/`runner.ts` for v1.2, update `client/` (`palette.ts`, `hud.ts`, `sceneBuilder.ts`, `style.css`, `main.ts`), and upgrade `verify-all.mjs` scenarios + tests without silently skipping superseded rules.

**Tech Stack:** TypeScript 5+, Vite 8, Three.js 0.187, Vitest 5, Node headless bundle (`esbuild`).

**Spec & ADR:** [`docs/superpowers/specs/2026-11-20-phase3-design.md`](../specs/2026-11-20-phase3-design.md) & [`CHANGELOG.md`](../../../CHANGELOG.md).

## Global Constraints
- `game.contract.json` `contract_version: "1.2"` matching `src/sim/constants.ts`.
- Night durations: `240 / 270 / 300 s`. Fuel: `max=100`, `decay=1.0/s`, `drain=5/s`, `low_fuel_threshold=30`, `relight_cost=5`, `win_ratio=0.6`, `capacity_max=20`.
- Strict step order in `stepTick`: `pause` → `timers + fuel decay/drain + lantern_out` → `move/fall` → `pickups (<= capacity)` → `interact (deposit/relight/refuel)` → `safe zone (fuel >= 30 only)` → `pulse (+5/+15 if drain)` → `shades (wander->weak/unlit/drain, chase, recoil, stunned->wander) & drifters` → `contacts` → `spawns` → `win/loss (no_flames first, then time<=0 dawn_survived vs dawn)`.
- Headless runtime for full night (Night 3 `18,000` ticks) stays `<= 30s`; browser render stays `>= 30 FPS` at `1280×720`.

## Review Focus
1. **Interaction priority & exact tie-breaks:** Full-fuel (`fuelTicks === 6000`) lit lanterns MUST be excluded before distance selection so a player standing next to a full `L1` and low/unlit `L2` refuels/lights `L2`; tie distances pick smaller `id`.
2. **Threshold `fuel === 30` vs `< 30`:** Safe zone (`6 m`) MUST stay active at exact `fuelTicks === 1800` (`30.0`) and deactivate strictly when `fuelTicks < 1800` (`< 30`).
3. **Refuel pushout transition:** Refueling a `< 30` lantern to `>= 30` MUST exit any draining shades targeting that lantern to `'wander'` AND apply `safePushTicksLeft = 30` so they do not deal contact damage while pushed out.
4. **Simultaneous `drain` + decay to `0` & Step 11 `no_flames` on final tick:** If `p.flames <= 0` happens on the exact tick `timeLeftS` hits `0`, `no_flames` (`lost`) takes precedence over `dawn_survived`.
5. **Colorblind distinguishability:** Colorblind setting persists in `localStorage` and alters shade emissive/eyes (`#7A3CFF -> #00B3FF`), HUD danger (`#FF5A5F -> #FFFFFF` + `⚠`), unlit lantern silhouette (`scale.y = 0.8` + tear overlays), and low-fuel 1 Hz blink cleanly without resetting mid-night state.

---

### Task 1: Contract v1.2, Constants, Types & World Init/Snapshot + Validator (TDD)
- **Files:** `game.contract.json`, `src/sim/constants.ts`, `src/sim/types.ts`, `src/sim/maps.ts`, `src/sim/world.ts`, `src/headless/validate.ts`, `tests/unit/world.test.ts`, `tests/contract/headless.test.ts`
- **Steps:**
  - [ ] Write failing unit/contract tests in `tests/unit/world.test.ts` & `tests/contract/headless.test.ts` for v1.2 contract fields, `240/270/300` durations, `player.capacity`, `lantern.{fuel, ever_lit, relit_count}`, `successful_lights`, `drain` shade state, and invalid `fuel` / `successful_lights` validator exits (`code 2`).
  - [ ] Verify RED failure via `npx vitest run tests/unit/world.test.ts`.
  - [ ] Update `game.contract.json` (`1.2`), `constants.ts`, `types.ts`, `maps.ts` (durations read from `TUNING`), `world.ts` (`fuelTicks`, `everLit`, `relitCount`, `successfulLights`, `capacity`, snapshot v1.2), and `validate.ts`.
  - [ ] Verify GREEN via `npx vitest run tests/unit/world.test.ts`.

### Task 2: Core Simulation Step v1.2 (`step.ts`) + Phase 3 Tests (TDD)
- **Files:** `src/sim/step.ts`, `src/sim/runner.ts`, `tests/unit/step.test.ts`, `tests/contract/headless.test.ts`, `tests/smoke.test.ts`
- **Steps:**
  - [ ] Write failing TDD tests in `tests/unit/step.test.ts` covering:
    1. Fuel decay `1/s` -> `lantern_out` (`deposited=0, ever_lit=true`) -> relight in `5` motes (`+40`) + `successful_lights` increasing `capacity` (`10 -> 12 .. -> 20`).
    2. Refuel `used = min(carried, ceil((100-fuel)/10))`, skips `fuel=100` full lantern, pushes shades out within `30` ticks when raised `< 30 -> >= 30`.
    3. Safe zone inactive at `fuel < 30`, active at `fuel == 30`.
    4. Shade `wander` picks weak (`lit && fuel < 30`) -> transitions `drain` at `<= 2m` -> drains `5/s` + natural `1/s` -> emits `fuel_drain` every `60` drain ticks -> `drain` transitions (`6m` chase, Pulse stun `+15`, refuel `>=30` / extinguish / `>2m` wander).
    5. Step 11 win/loss: no early `all_lit`, `dawn_survived` when `flames > 0 && time <= 0 && lit >= ceil(0.6*total)` with v1.2 dawn bonuses (`50 + floor(fuel)` + `50 * flames`), `no_flames` priority on final tick.
  - [ ] Verify RED failure via `npx vitest run tests/unit/step.test.ts`.
  - [ ] Implement v1.2 Step 2/4/5/6/7/8/11 in `src/sim/step.ts` and check `runner.ts`.
  - [ ] Update affected old assertions (`tests/contract/headless.test.ts`, `tests/smoke.test.ts`) to v1.2 & verify ALL `npm test` tests pass GREEN (`0` skipped).
  - [ ] Commit simulation & contract milestone (`feat(sim,headless): implement Contract v1.2 lantern fuel, drain, capacity, and dawn_survived rules`).

### Task 3: Client Phase 3 — Fuel Bars, 1 Hz Blink, Torn Unlit Lanterns, Colorblind Mode & HUD
- **Files:** `src/client/palette.ts`, `src/client/sceneBuilder.ts`, `src/client/hud.ts`, `src/client/style.css`, `index.html`, `src/client/main.ts`, `src/client/audio.ts`
- **Steps:**
  - [ ] Update `palette.ts` with colorblind tokens (`shadeEyeCb: 0x00B3FF`, `dangerCbHex: '#FFFFFF'`).
  - [ ] Upgrade `sceneBuilder.ts`: unlit lantern squashed `20%` (`scale.y = 0.8`) + visible torn paper slashes; lit lantern 3D floating fuel bar (`0..100%`) + `1 Hz` blink when `fuel < 30`; Bóng Mực `drain` visual pose + colorblind eye/rim switching; low-fuel warning audio/particle feedback.
  - [ ] Upgrade `index.html`, `style.css`, `hud.ts`, `main.ts`: dynamic `carried / capacity` (`10..20` slot bar), lantern count threshold (`k/n · Cần m`), low-fuel HUD badge & `1 Hz` blinking card cue, refuel contextual prompt (`[E] Châm dầu...`), Settings toggle `"Bảng màu dễ phân biệt"` persisted in `localStorage` switching CSS class `is-colorblind` (`#FFFFFF + ⚠`) and updating 3D palette immediately, and new audio cues for `lantern_out` & `refuel`.
  - [ ] Run `impeccable detect --json`, `npm run typecheck`, `npm run build`, and `npm test`.
  - [ ] Commit client changes (`feat(client): add lantern fuel bars, torn unlit meshes, dynamic capacity HUD, and colorblind mode`).

### Task 4: Scenarios, Verification Gate, Live Browser Check, Independent Review & PR -> `phase-3`
- **Files:** `scripts/verify-all.mjs`, `docs/proof/phase1-scenarios/*`, `docs/proof/phase3-scenarios/*`, `docs/proof/phase-3-proof.md`, `docs/notes/ai-log.md`, `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `README.md`
- **Steps:**
  - [ ] Update `docs/proof/phase1-scenarios/win-all-lit.*` (migrated to v1.2 survival/refuel/dawn_survived verification) and create dedicated Phase 3 scenarios in `docs/proof/phase3-scenarios/` (`fuel-refuel-relight`, `shade-drain-pulse`, `dawn-survived-threshold`, `capacity-scaling`).
  - [ ] Update `scripts/verify-all.mjs`, `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `README.md`, `docs/notes/ai-log.md`, `docs/proof/phase-3-proof.md`.
  - [ ] Run `npm run build && npm run verify`, verify browser live (`1280×720`, colorblind toggle persistence, torn unlit lantern vs lit fuel bar, `>= 30 FPS`, 0 console errors), dispatch independent branch reviewer (`main..HEAD`), fix any findings, merge PR to `main`, re-verify on `main`, and push tag `phase-3` to `origin`.
