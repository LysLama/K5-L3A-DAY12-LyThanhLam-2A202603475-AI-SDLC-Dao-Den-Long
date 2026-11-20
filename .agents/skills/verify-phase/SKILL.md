---
name: verify-phase
description: Run build, Phase 1 regression + Phase 2 unit/contract tests, Test Contract v1.1 headless scenarios across Nights 1-3, 21,600-tick timing benchmark, and determinism check before tagging.
---

# Verify Phase Workflow (Contract v1.1)

1. Run `npm run typecheck` and `npm run build` (`dist/` + `dist-headless/cli.mjs`).
2. Run `npm run verify` (`scripts/verify-all.mjs`), verifying:
   - `game.contract.json` (`1.1`) deep equality with `src/sim/constants.ts`
   - Full `vitest run` suite (Phase 1 regression under normalized v1.1 numbers + Phase 2 mechanics)
   - Headless scenarios for all Phase 2 features: Dash, Bùa Gió, Gió Lạc (steal & pulse drop), Night 2 (bamboo bridge & jump pads), Night 3 (3 tiers, 2 ramps, jump pad, bell tower, wind gusts), Pause/Resume
   - 21,600-tick Night 3 headless benchmark completing in ≤ 30s
   - Two-run byte-for-byte determinism check (`--seed 42`) across Nights 1, 2, 3
3. Inspect client at `1280×720` verifying 3-night menu flow, settings persistence, SVG HUD + off-screen indicator, zero console errors, and average FPS ≥ 30.
4. Record all observed outputs in `docs/proof/phase-<N>-proof.md` matching the tagged commit.
