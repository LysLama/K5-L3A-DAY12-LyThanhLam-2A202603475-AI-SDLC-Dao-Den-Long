# AGENTS.md — Đảo Đèn Lồng (Phase 3 · Contract v1.2)

## Commands
- Install & build: `npm ci && npm run build`
- Unit & contract tests: `npm test` (auto-runs `pretest` headless build)
- Type check: `npm run typecheck`
- Play 3D game: `npm run start`
- Headless CLI (Night 1 / 2 / 3): `node dist-headless/cli.mjs --seed 42 --night 3 --ticks 600 --out out.jsonl`
- Full verification gate (Phase 1 regression + Phase 2 + Phase 3 scenarios + perf): `npm run verify`

## Architecture & Hard Rules
1. **Pure Simulation Boundary (`src/sim/`):** NEVER import `three`, `window`, `document`, DOM, or Node `fs`/`process` APIs inside `src/sim/`. Keep map definitions cleanly in `src/sim/maps.ts`.
2. **Determinism & Performance:** NEVER call `Math.random()` or `Date.now()` in `src/sim/`. Use `SimState.rng` (`mulberry32`). Track lantern fuel in integer `1/60` units (`fuelTicks: 0..6000`) to prevent floating-point drift across 18,000+ ticks. Full 21,600-tick night MUST finish in ≤ 30s.
3. **Contract v1.2 Sync & Mandatory Tick Order:** `src/sim/constants.ts` MUST deeply match `game.contract.json`. `stepTick` follows the deterministic intra-tick order (`pause` → timers + fuel decay/drain/`lantern_out` → move/dash/jump/pad/wind/fall → pickups capped by `capacity` → light/relight/refuel/pushout → safe zones `fuel >= 30` → pulse +`15` drain stun → move shades/drifters `drain`/`wander` AI → contacts → spawns → `dawn_survived`/`dawn`/`no_flames`).
4. **Shade States & Palette:** Shades MUST use exact state names: `spawning`, `wander`, `chase`, `recoil`, `stunned`, `drain`. Client colors MUST match TICKET-02/TICKET-03 palette (`src/client/palette.ts`), including Colorblind Mode (`#00B3FF` shade eyes/glow, `#FFFFFF` UI danger + `⚠`).
5. **Verification Gate:** Never finish a task without running `npm test` / `npm run verify` and checking real browser render at `1280×720` (≥ 30 FPS).
6. **Git Safety:** NEVER push to `upstream`; push/PR only to `origin` (`LysLama`). Keep harness files intact.
