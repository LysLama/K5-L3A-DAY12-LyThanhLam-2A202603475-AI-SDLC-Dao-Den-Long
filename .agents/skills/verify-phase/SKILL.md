---
name: verify-phase
description: Run build, Phase 1-3 unit/contract tests, Test Contract v1.2 headless scenarios across Nights 1-3, 21,600-tick timing benchmark, determinism check, and browser colorblind/FPS check before tagging.
---

# Verify Phase Workflow (Contract v1.2)

1. Run `npm run typecheck` and `npm run build` (`dist/` + `dist-headless/cli.mjs`).
2. Run `npm run verify` (`scripts/verify-all.mjs`), verifying:
   - `game.contract.json` (`1.2`) deep equality with `src/sim/constants.ts`
   - Full `vitest run` suite (Phase 1–2 non-superseded mechanics + Phase 3 fuel/drain/relight/capacity/dawn_survived/scoring v1.2)
   - Headless scenarios for Phase 1 regression, Phase 2 (Dash, Bùa Gió, Gió Lạc, Night 2, Night 3, Pause), and Phase 3 (`fuel-refuel-relight`, `shade-drain-pulse`, `dawn-survived-threshold`, `capacity-scaling`)
   - 21,600-tick Night 3 headless benchmark completing in ≤ 30s
   - Two-run byte-for-byte determinism check (`--seed 42`) across Nights 1, 2, 3
3. Inspect client at `1280×720` verifying 3-night menu flow, `"Bảng màu dễ phân biệt"` persistence & visual colors (`#00B3FF` + `#FFFFFF` + `⚠`), dynamic capacity & lantern fuel UI, zero console errors, and average FPS ≥ 30.
4. Record all observed outputs in `docs/proof/phase-<N>-proof.md` matching the tagged commit.
