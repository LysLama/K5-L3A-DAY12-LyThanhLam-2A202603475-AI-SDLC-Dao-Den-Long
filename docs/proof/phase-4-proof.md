# Bằng chứng Kiểm chứng Phase 4 — "Bình minh: phát hành v1.0.0" (Contract `v1.3`)

- **Tag nộp:** `phase-4` & GitHub Release `v1.0.0`
- **Contract:** `game.contract.json` (`contract_version: "1.3"`)
- **Môi trường đo & kiểm chứng:** Windows `10.0.26300 (x64)`, Electron `45.4.1`, Three.js `0.187.0`, ANGLE (`Intel(R) Iris(R) Xe Graphics`, OpenGL `4.5.0`), Node.js `v22`

---

## 1. Kết quả Cổng Nghiệm thu 1 Lệnh (`npm run build && npm run verify`)

Chạy trên mã nguồn Phase 4 (`Vitest v5.1.1` + `Node v22`):

- **`npm run build`:** `tsc --noEmit && vite build && node scripts/build-headless.mjs && node scripts/build-app.mjs` — `✓ built in 209ms`, `0` lỗi TypeScript.
- **1/7 Unit & Contract Suite (`npm test`):** **`13` file / `44` test PASS (`1.99s`)**, gồm:
  - `tests/unit/world.test.ts` (4 tests)
  - `tests/unit/step.test.ts` (12 tests)
  - `tests/unit/maps.test.ts` (3 tests)
  - `tests/unit/leaderboard.test.ts` (4 tests — chuẩn hóa tên `3–12` ký tự, xếp hạng giảm dần / ưu tiên `achieved_at` sớm hơn, giới hạn Top 10)
  - `tests/unit/benchStats.test.ts` (2 tests — `avg_fps`, `p1_low_fps`, `frame_ms_p95`)
  - `tests/unit/benchOrbit.test.ts` (1 test — quỹ đạo camera góc `0°` tại `(30, 15, 0)`, chu kỳ `15 s` ngược chiều kim đồng hồ)
  - `tests/unit/benchWorld.test.ts` (2 tests — đúng `200` Bóng Mực `wander`, `100` đom đóm, `L1–L3` sáng `fuel = 100`, Mây đứng tại `(0,0,0)`)
  - `tests/unit/soak.test.ts` (1 test — luân phiên `1 → 2 → 3` chạy hết đêm với `0` crashes)
  - `tests/unit/clientInput.test.ts` (4 tests — đổi `9` phím, phát hiện xung đột, khôi phục mặc định)
  - `tests/unit/renderSmoothing.test.ts` (2 tests)
  - `tests/smoke.test.ts` (1 test)
  - `tests/contract/headless.test.ts` (5 tests — phát hiện sai Contract JSON/schema, chạy stress `21,600` ticks Đêm 3 dưới `30 s` tất định `100%`)
  - `tests/contract/appCli.test.ts` (3 tests — `run.mjs --export-leaderboard`, `soak.mjs`)
- **2/7 Build Artifacts & `game.contract.json` `v1.3`:** **PASS** (`dist/`, `dist-headless/cli.mjs`, `dist-app/{run,bench,soak}.mjs`).
- **3/7 Phase 1 Regressions (4 kịch bản dưới luật `v1.3`):** **PASS** (`win-all-lit`, `loss-no-flames`, `loss-dawn`, `fall-edge`).
- **4/7 Phase 2 Features (6 kịch bản dưới luật `v1.3`):** **PASS** (`dash`, `charm`, `drifter`, `night2-bridge-jump`, `night3-tiers-wind`, `pause-resume`).
- **5/7 Phase 3 Fuel / Drain+Pulse / Dawn Survived / Capacity Scaling (4 kịch bản):** **PASS** (`fuel-refuel-relight`, `shade-drain-pulse`, `dawn-survived-threshold`, `capacity-scaling`).
- **6/7 Determinism Đêm 1–3 & Night 3 `21,600` ticks CLI benchmark:** **PASS** (`21,600` ticks trong `524 ms <= 30,000 ms`).
- **7/7 Leaderboard Export, Live 10-Night Soak & Bench/Soak Reports:** **PASS**
  - Xuất leaderboard CLI (`empty` & `sorted`): **PASS**
  - Live 10-Night Soak trong gate: `crashes=0`, RSS `45 -> 41 MB` trong `0.3 s` (**PASS**)

---

## 2. Benchmark Đồ họa `1280×720` (`bench_cmd`) & Soak Test `10` Đêm (`soak_cmd`)

### Benchmark 30 giây (`node dist-app/bench.mjs --seed 42 --duration 30 --out bench.json`)
- Kết quả thực tế trong [bench.json](../../bench.json):
  - `contract_version`: `"1.3"`
  - `avg_fps`: **`1113.6`** (đạt yêu cầu `>= 60`)
  - `p1_low_fps`: **`33`** (đạt yêu cầu `>= 30`)
  - `frame_ms_p95`: **`1.1`** ms
  - `frames`: **`33,408`**
  - `load_ms`: **`484`** ms (đạt yêu cầu `<= 10,000 ms`)
  - `peak_mem_mb`: **`634`** MB
  - `vsync_off`: **`true`** (`disable-gpu-vsync`, `disable-frame-rate-limit`, `use-angle=gl`)
  - `renderer`: `"Three.js 0.187.0 (ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5.0))"`
- *Hành trình tối ưu:* Trước khi tối ưu, bản ban đầu đạt `12.4 FPS` do `EffectComposer`/`UnrealBloomPass` + `ACESFilmicToneMapping` + `149` draw calls trên `ANGLE D3D11`. Sau khi chuyển `InstancedMesh`, `NoToneMapping`, halo sprite và `use-angle=gl`, tốc độ đạt `1113.6 FPS` (`p1_low_fps = 33`).

### Soak Test `10` Đêm (`node dist-app/soak.mjs --seed 7 --nights 10 --out soak.json`)
- Kết quả thực tế trong [soak.json](../../soak.json):
  - `nights`: **`10`**, `crashes`: **`0`**
  - `mem_start_mb`: **`43`** → `mem_end_mb`: **`38`** (`duration_s: 0.3`)

---

## 3. UI, Trợ năng (`>= 18px`), Quét `impeccable` & Đóng gói

- **`impeccable detect --json index.html src/client/style.css src/client/hud.ts src/client/icons.ts`:** Trả về **`[]`** (`0` cảnh báo).
- **Trợ năng & Đổi phím (`1280×720`):** Cỡ chữ nền `18px–34px`, bật **Chữ lớn (`×1.25`)** tăng lên `22.5px–42.5px`, bật **Giảm chuyển động** tắt rung/chớp, đổi cả `9` phím với phát hiện xung đột & khôi phục mặc định, `0` lỗi console/pageerror.
- **Đóng gói (`npm run package:release` & `Dockerfile`):** Xuất gói tĩnh **`dao-den-long-v1.0.0-web.zip`** (`~192.3 KB`), kèm `Dockerfile` (`node:22-slim`, `EXPOSE 4173`) và video demo **`docs/demo/demo.mp4`** (`1280×720` H.264, dưới `5` phút).
