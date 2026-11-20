# AGENTS.md — Đảo Đèn Lồng (Phase 2 · Contract v1.1)

## Commands
- Install & build: `npm ci && npm run build`
- Unit & contract tests: `npm test` (auto-runs `pretest` headless build)
- Type check: `npm run typecheck`
- Play 3D game: `npm run start`
- Headless CLI (Night 1 / 2 / 3): `node dist-headless/cli.mjs --seed 42 --night 2 --ticks 600 --out out.jsonl`
- Full verification gate (Phase 1 regression + Phase 2 scenarios + perf): `npm run verify`

## Architecture & Hard Rules
1. **Pure Simulation Boundary (`src/sim/`):** NEVER import `three`, `window`, `document`, DOM, or Node `fs`/`process` APIs inside `src/sim/`. Keep map definitions cleanly in `src/sim/maps.ts`.
2. **Determinism & Performance:** NEVER call `Math.random()` or `Date.now()` in `src/sim/`. Use `SimState.rng` (`mulberry32`). Full 21,600-tick night MUST finish in ≤ 30s (keep step loop allocation-light).
3. **Contract v1.1 Sync & Mandatory Tick Order:** `src/sim/constants.ts` MUST deeply match `game.contract.json`. `stepTick` MUST follow TICKET-02's 12-step intra-tick order (`pause` → timers → move/dash/jump/pad/wind/fall → pickups → interact → safe zone → pulse → move shades/drifters → contacts → spawns → win/loss).
4. **Shade States & Palette:** Shades MUST use exact state names: `spawning`, `wander`, `chase`, `recoil`, `stunned`. Client colors MUST stay within ±10% RGB of TICKET-02 palette (`src/client/palette.ts`).
5. **Verification Gate:** Never finish a task without running `npm test` / `npm run verify` and checking real browser render at `1280×720` (≥ 30 FPS).
6. **Git Safety:** NEVER push to `upstream`; push/PR only to `origin` (`LysLama`). Keep harness files intact.
