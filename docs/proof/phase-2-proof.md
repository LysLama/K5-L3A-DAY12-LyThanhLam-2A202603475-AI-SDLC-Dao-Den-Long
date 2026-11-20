# Bằng chứng Kiểm chứng Phase 2 — TICKET-02 ("Ba hòn đảo", Contract v1.1)

## 1. Tóm tắt Kết quả Tổng hợp (`npm run build && npm run verify`)

- **Typecheck & Production Build:** `tsc --noEmit` + `vite build` (`dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`) + `node scripts/build-headless.mjs` (`dist-headless/cli.mjs`) — **PASS (0 errors)**.
- **Unit & Contract Test Suite (`vitest run`):** **7 test files / 23 tests PASS**:
  - `tests/smoke.test.ts` (1 test)
  - `tests/unit/maps.test.ts` (3 tests: Đêm 1/2/3 geometry, cầu tre, bục nhảy, dốc `30°/150°`, vách đứng, Tháp chuông)
  - `tests/unit/renderSmoothing.test.ts` (2 tests: nội suy chuyển động & xoay góc)
  - `tests/unit/world.test.ts` (3 tests: khởi tạo chuẩn v1.1, Đêm 1–3, scenario seed)
  - `tests/unit/step.test.ts` (8 tests: 12 bước tick, tăng/giảm tốc `≤ 0.1s`, Lướt `14 m/s`, Bùa Gió, Gió Lạc, Đêm 2/3, rơi `-10m` chờ `60` tick, Tỏa Sáng `5m` 3D, điểm chuẩn hóa)
  - `tests/unit/clientInput.test.ts` (2 tests: `WASD` + `Shift` Lướt + `Q/R/RMB` Tỏa Sáng + `P/Esc` Pause + camera `45°` parity)
  - `tests/contract/headless.test.ts` (4 tests: exit code 1/2, `--night 1|2|3`, 21,600 tick Night 3 `< 30s` & tất định 100%)
- **Code Slop / UI Quality Check (`impeccable detect --json`):** `[]` (0 cảnh báo).

---

## 2. Kết quả Kịch bản Headless Phase 1 (Chuẩn hóa v1.1) & Phase 2

| Kịch bản | Đêm | Mục tiêu kiểm chứng | Kết quả quan sát |
|---|---|---|---|
| `win-all-lit` (Phase 1 reg.) | 1 | Nhặt đom đóm, Tỏa Sáng (`+5`), nạp (`+10/mote`), thắp đèn (`+100`), thắng (`all_lit`) | **PASS** (`ticks=176, score=869`) |
| `loss-no-flames` (Phase 1 reg.) | 1 | Mất Ngọn Lửa cuối từ Bóng Mực -> thua `no_flames` | **PASS** (`ticks=16`) |
| `loss-dawn` (Phase 1 reg.) | 1 | Hết giờ trước khi thắp đủ đèn -> thua `dawn` | **PASS** (`ticks=12`) |
| `fall-edge` (Phase 1 reg.) | 1 | Rơi khỏi đảo `Y < -10` -> `-1` Ngọn Lửa, mất hết đom đóm (`dropped=0, lost=4`), hồi sinh `[0,0,0]` | **PASS** (`tick=66, lost=4`) |
| `dash` | 1 | Lướt trên không giữ nguyên `Y=0.5`, hồi chiêu `1.5s`, lướt lại lần 2 ở tick `97` | **PASS** (`events=6,97`) |
| `charm` | 2 | Nhặt Bùa Gió `C1` (`charm_picked`), chạy `7.2 m/s`, Lướt liên tiếp 0 hồi chiêu | **PASS** (`pickedTick=7, dashes=2`) |
| `drifter` | 2 | Gió Lạc đuổi cướp `3` đom đóm (`drifter_steal`), trúng Tỏa Sáng đánh rơi `3` (`drifter_drop`) | **PASS** (`stealTick=9, dropTick=26`) |
| `night2-bridge-jump` | 2 | Bục nhảy `(20,0,18)` bay sang Đảo B, qua Cầu tre `(x=35)`, thắp đèn cuối thắng | **PASS** (`airJump=true, bridgeWalk=true, endTick=596`) |
| `night3-tiers-wind` | 3 | Leo dốc `30°` lên Tầng 1 (`Y=3`), bục nhảy `(0,3,13)` lên Tầng 2 (`Y=6`), chặn Tháp chuông `r>=2m`, Gió mạnh tick `1800` | **PASS** (`windActiveTick=1800`) |
| `pause-resume` | 1 | Sườn lên `pause` đóng băng `sim_tick=10`, mở lại tiếp tục `sim_tick=25` | **PASS** |
| Determinism & Benchmark 21,600 ticks | 1, 2, 3 | Hai lần chạy `--seed 42 --night 1|2|3` giống nhau 100%; `21,600` tick Đêm 3 CLI ≤ 30s | **PASS (`382 ms` <= `30,000 ms`)** |

---

## 3. Kiểm thử Trực tiếp trên Trình duyệt (`1280×720`, Vite Preview `http://127.0.0.1:4173/`)

Kiểm tra tương tác thực tế qua subagent trình duyệt tại viewport `1280×720`:
- **Lỗi Console / Page Errors:** **0 lỗi** trong toàn bộ phiên từ Menu, Cài đặt, Đêm 1, Đêm 2 đến Đêm 3.
- **Lưu Cài đặt (`localStorage`):** Thay đổi Âm lượng `75% -> 60%` và Độ nhạy camera `1.0× -> 1.3×`, tải lại trang (`reload`), mở lại `Cài đặt` xác nhận giữ đúng `60%` và `1.3×`.
- **Giao diện HUD & Bố cục:**
  - Menu chính (`Bắt đầu Hành trình`, chọn nhanh Đêm 1/2/3, Cài đặt), Intro Đêm với lời Ông Đăng, Thanh HUD top một hàng gọn (`x=20..1260, y=16..55`, không xuống dòng ở Đêm 3 với 7 đèn), Thanh đom đóm 10 ô, Hồi chiêu Lướt & Tỏa Sáng, Mũi tên chỉ hướng đèn ngoài màn hình (`L1 · 23m`, `L2 · 20m`).
- **Độ mượt (FPS thực tế trên trình duyệt, `≥ 30 FPS`):**
  - Đêm 2 (`Đảo Cau`): **109 FPS** (quan sát tại `#pause-sub` sau chuyển cảnh ổn định)
  - Đêm 3 (`Đảo Chuông`): **49 FPS** (quan sát tại `#pause-sub` cùng 3 tầng, dốc, Tháp chuông và 7 Đèn Lồng)
