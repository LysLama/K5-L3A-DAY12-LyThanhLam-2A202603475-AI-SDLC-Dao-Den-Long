---
name: verify-phase
description: Run build, Phase 1-4 unit/contract tests, Test Contract v1.3 headless scenarios across Nights 1-3, 21,600-tick CLI benchmark, Electron 1280x720 benchmark, 10-night soak, leaderboard export, accessibility/browser QA, and clean-clone verification before tagging or releasing.
---

# Verify Phase Workflow (Contract v1.3 / v1.0.0)

1. Run `npm run typecheck` and `npm run build` (`dist/`, `dist-headless/cli.mjs`, `dist-app/{run,bench,soak}.mjs`).
2. Run `npm run verify` (`scripts/verify-all.mjs`), verifying all `7/7` stages:
   - `game.contract.json` (`1.3`) deep equality with `src/sim/constants.ts` and built CLI paths
   - Full `vitest run` suite (13 files / 44 tests covering Phase 1–4 units & CLIs)
   - 14 headless scenarios for Phase 1 regression, Phase 2, and Phase 3
   - 21,600-tick Night 3 CLI benchmark (`<= 30s`) + byte-for-byte determinism (`--seed 42`)
   - Live `run.mjs --export-leaderboard` check, live 10-night `soak.mjs` RSS check, and committed `bench.json` + `soak.json` threshold validation
3. On desktop GPU environment, run `node dist-app/bench.mjs --seed 42 --duration 30 --out bench.json` and `node dist-app/soak.mjs --seed 7 --nights 10 --out soak.json` confirming `avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`, `crashes = 0`, `mem_end_mb <= 1.2 * mem_start_mb`.
4. Verify live UI at `1280×720` (Menu, Leaderboard, Settings Accessibility toggles, 9-action Keybind Remap + Conflict Alert + Reset, Base `>= 18px` / Large `×1.25` typography, Night 1–3 gameplay, `impeccable detect --json` -> `[]`).
5. Record all observed outputs in `docs/proof/phase-<N>-proof.md` and confirm clean-clone build/run in a temporary directory before tagging and publishing a GitHub Release.
