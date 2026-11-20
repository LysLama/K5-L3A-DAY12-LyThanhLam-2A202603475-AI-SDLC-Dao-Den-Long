---
name: verify-phase
description: Run build, unit tests, Test Contract headless scenarios, and determinism check before tagging any phase.
---

# Verify Phase Workflow

1. Run `npm run typecheck` and `npm run build` to ensure `dist/` and `dist-headless/cli.mjs` match latest TypeScript source.
2. Run `npm run verify` (`scripts/verify-all.mjs`) which executes:
   - `game.contract.json` vs `src/sim/constants.ts` sync check
   - Full `vitest run` suite (unit + headless contract tests)
   - Saved phase scenario runs (`docs/proof/phase1-scenarios/*.json`)
   - Two-run byte-for-byte determinism check (`--seed 42`)
3. Inspect stdout/stderr and generated `.jsonl` outputs; never accept an empty or skipped run as passing.
4. Record observed command outputs in `docs/proof/phase-<N>-proof.md` matching the exact commit being tagged.
