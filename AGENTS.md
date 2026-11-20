# AGENTS.md — Đảo Đèn Lồng (v1.0.0 · Contract v1.3)

## Commands
- Install & build: `npm ci && npm run build`
- Unit & contract tests: `npm test` (auto-runs `pretest` headless + app builds)
- Type check: `npm run typecheck`
- Play 3D game: `npm run start` (`node dist-app/run.mjs`)
- Export leaderboard: `node dist-app/run.mjs --export-leaderboard leaderboard-export.json`
- Benchmark 1280×720 (`--bench`): `node dist-app/bench.mjs --seed 42 --duration 30 --out bench.json`
- 10-Night Soak test (`--soak`): `node dist-app/soak.mjs --seed 7 --nights 10 --out soak.json`
- Package release zip: `npm run package:release`
- Headless CLI (Night 1 / 2 / 3): `node dist-headless/cli.mjs --seed 42 --night 3 --ticks 600 --out out.jsonl`
- Full verification gate (Tests + 14 Scenarios + Determinism + 21.6k CLI Bench + Leaderboard Export + 10-Night Soak + Reports): `npm run verify`

## Architecture & Hard Rules
1. **Pure Simulation Boundary (`src/sim/`):** NEVER import `three`, `window`, `document`, Electron, or Node `fs`/`process` APIs inside `src/sim/`. Keep map definitions cleanly in `src/sim/maps.ts` and shared Contract v1.3 schemas/helpers in `src/shared/` (`leaderboard.ts`, `benchStats.ts`).
2. **Determinism & Performance:** NEVER call `Math.random()` or `Date.now()` in `src/sim/`. Use `SimState.rng` (`mulberry32`). Track lantern fuel in integer `1/60` units (`fuelTicks: 0..6000`). Both `bench_cmd` (`avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`) and `soak_cmd` (`0` crashes, `mem_end <= 1.2 * mem_start`) must pass honestly on the same real render pipeline (`sceneBuilder.ts` uses `InstancedMesh` batching — keep creative additions disabled or zero-impact during `benchMode`).
3. **Contract v1.3 Sync & Mandatory Tick Order:** `src/sim/constants.ts` MUST deeply match `game.contract.json`. Keep `"run_cmd"`, `"headless_cmd"`, `"bench_cmd"`, `"soak_cmd"` exact. `stepTick` short-circuits decay/damage/pickups/win-loss cleanly only when `state.benchMode === true`.
4. **Accessibility & UI Standards:** Maintain base UI text `>= 18px` with `--ui-scale` (`1.25` for Large Text), Colorblind Mode (`#00B3FF` shade eyes/glow, `#FFFFFF` + `⚠` alerts), Reduce Motion (disables camera shake & CSS motion), and full 9-action keybinding remapping with conflict alert + restore defaults.
5. **Verification Gate:** Never finish a task without running `npm run build && npm run verify`, verifying real browser/Electron rendering at `1280×720`, and testing a clean-clone install before tagging/releasing.
6. **Git Safety:** NEVER push to `upstream` (`VinUni-AI20k`); push/PR/tag/Release ONLY to `origin` (`LysLama`). Keep `.agents/`, `.github/`, `LICENSE`, `CREDITS.md`, and git history free of build/secret clutter.
