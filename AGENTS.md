# AGENTS.md — Đảo Đèn Lồng

## Commands
- Install & build: `npm ci && npm run build`
- Unit & contract tests: `npm test`
- Type check: `npm run typecheck`
- Play 3D game: `npm run start`
- Headless CLI: `node dist-headless/cli.mjs --seed 42 --night 1 --ticks 600 --out out.jsonl`
- Full verification gate: `npm run verify`

## Architecture & Hard Rules
1. **Pure Simulation Boundary (`src/sim/`):** NEVER import `three`, `window`, `document`, DOM, or Node fs/process APIs inside `src/sim/`.
2. **Determinism:** NEVER call `Math.random()` or `Date.now()` in `src/sim/`. Always consume the seeded `mulberry32` PRNG stored on `SimState`.
3. **Test Contract Sync:** Any change to `src/sim/constants.ts` tuning MUST match `game.contract.json` (`tests/unit/world.test.ts` enforces equality).
4. **XZ Distance & Precision:** All radii in `tuning` use XZ planar distance (`<= r`). Round serialized coordinates and `time_left_s` to 3 decimals.
5. **Verification Gate:** Never mark a task complete without running `npm test` (and `npm run verify` once available) and reading actual passing output.
6. **Git Safety:** Never push to `upstream` (`VinUni-AI20k`); push only to `origin`. Keep harness files and git history intact.
