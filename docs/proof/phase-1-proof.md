# Bằng chứng Kiểm chứng — Phase 1 (`phase-1`)

Tất cả kiểm chứng dưới đây được chạy trực tiếp sau lần chỉnh mã nguồn cuối cùng bằng một lệnh `npm run build && npm run verify`.

## 1. Ma trận Truy vết Yêu cầu → Bằng chứng

| Yêu cầu (PRD-0 / Test Contract v1.0) | Cách kiểm chứng | Tệp / Lệnh bằng chứng | Kết quả thực tế quan sát |
|---|---|---|---|
| Khai báo `game.contract.json` v1.0 & đồng bộ `TUNING` | Unit test so sánh sâu `TUNING` với `game.contract.json` | `tests/smoke.test.ts`, `tests/unit/world.test.ts` (`npm test`) | **Đạt** (deepEqual khớp 100%) |
| Đảo tròn, 5 Đèn Lồng, Đom đóm, Bóng Mực & Merge `scenario` | Unit test khởi tạo mặc định và `scenario` ghi đè không phát event/score | `tests/unit/world.test.ts` | **Đạt** (4/4 test pass) |
| Di chuyển theo `cam_yaw_deg`, chuẩn hóa vector, sườn lên button, nhảy/rơi, `pickup`, `pulse` trước `hit`, `safe_radius`, `all_lit` trước `dawn` | Unit test từng cơ chế và biên trong `stepTick` | `tests/unit/step.test.ts` | **Đạt** (7/7 test pass) |
| Chuẩn CLI `--seed`, `--night 1`, exit code `2` khi sai JSON/schema (`inputs`/`scenario`), exit `1` khi sai flag | Integration test chạy tiến trình `node dist-headless/cli.mjs` | `tests/contract/headless.test.ts` | **Đạt** (4/4 test pass) |
| Tương thích điều khiển client 3D & camera Y-up | Unit test `mapKeysToInput` + tích có hướng ở yaw `0°`, `45°`, `90°` | `tests/unit/clientInput.test.ts` | **Đạt** (2/2 test pass) |
| Kịch bản thắng Đêm 1 đủ chu trình (`mote_picked` → `pulse` → `deposit` → `lantern_lit` → `all_lit`) | Chạy CLI trên `win-all-lit.scenario.json` + `win-all-lit.inputs.json` | [`docs/proof/phase1-scenarios/out-win-all-lit.jsonl`](phase1-scenarios/out-win-all-lit.jsonl) | **Đạt** (`ticks=171`, `state="won"`, `score=1870`) |
| Kịch bản thua do mất hết lửa (`no_flames`) | Chạy CLI trên `loss-no-flames.scenario.json` | [`docs/proof/phase1-scenarios/out-loss-no-flames.jsonl`](phase1-scenarios/out-loss-no-flames.jsonl) | **Đạt** (`ticks=12`, `state="lost"`, `reason="no_flames"`) |
| Kịch bản thua do hết giờ bình minh (`dawn`) | Chạy CLI trên `loss-dawn.scenario.json` | [`docs/proof/phase1-scenarios/out-loss-dawn.jsonl`](phase1-scenarios/out-loss-dawn.jsonl) | **Đạt** (`ticks=12`, `state="lost"`, `reason="dawn"`) |
| Kịch bản rơi khỏi đảo (`fall_enabled: true`) | Chạy CLI trên `fall-edge.scenario.json` + `fall-edge.inputs.json` | [`docs/proof/phase1-scenarios/out-fall-edge.jsonl`](phase1-scenarios/out-fall-edge.jsonl) | **Đạt** (`tick=44`, `player_hit {by:"fall", flames:2, dropped:2}`) |
| Tính tất định tuyệt đối theo `--seed` | Chạy `dist-headless/cli.mjs --seed 42 --night 1 --ticks 600` hai lần, so từng byte | `npm run verify` (`scripts/verify-all.mjs`) | **Đạt** (`92,401` bytes trùng khớp 100%) |
| Build & chơi 3D trên trình duyệt (Mây nón lá, 5 đèn, HUD, không lỗi console) | `npm run build` (`dist/` + `dist-headless/cli.mjs`) + kiểm tra trực tiếp trên trình duyệt | `vite preview` + `browser` subagent (`http://127.0.0.1:4173`) | **Đạt** (WebGL canvas `1015×907`, 0 lỗi console/page, `KeyW`/`Space`/`KeyP` & nút `Chơi lại` hoạt động đầy đủ) |

## 2. Kết quả chạy `npm run build && npm run verify`

```text
> tsc --noEmit && vite build && node scripts/build-headless.mjs
✓ 16 modules transformed.
dist/index.html                   1.82 kB │ gzip:   0.78 kB
dist/assets/index-Bss0dMaw.js   568.62 kB │ gzip: 143.64 kB
✓ built in 211ms

 Test Files  5 passed (5)
      Tests  18 passed (18)
  - win-all-lit: PASS (ticks=171, score=1870)
  - loss-no-flames: PASS (ticks=12)
  - loss-dawn: PASS (ticks=12)
  - fall-edge: PASS (tick=44, dropped=2)
  - determinism: PASS (92401 bytes identical)
ALL VERIFICATION CHECKS PASSED.
```
