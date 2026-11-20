# Bằng chứng Kiểm chứng Phase 3 — TICKET-03 ("Đèn cạn dầu", Contract v1.2)

## 1. Tóm tắt Kết quả Tổng hợp (`npm run build && npm run verify`)

- **Typecheck & Production Build:** `tsc --noEmit` + `vite build` (`dist/index.html` `8.17 kB`, `dist/assets/*.css` `9.32 kB`, `dist/assets/*.js` `699.26 kB`) + `node scripts/build-headless.mjs` (`dist-headless/cli.mjs`) — **PASS (0 errors)**.
- **Unit & Contract Test Suite (`vitest run`):** **7 test files / 27 tests PASS**:
  - `tests/smoke.test.ts` (1 test)
  - `tests/unit/maps.test.ts` (3 tests: Đêm 1/2/3 geometry, thời lượng `240/270/300s`, cầu tre, bục nhảy, dốc, Tháp chuông)
  - `tests/unit/renderSmoothing.test.ts` (2 tests)
  - `tests/unit/world.test.ts` (3 tests: Contract `v1.2`, khởi tạo `fuelTicks`, `capacity`, scenario `fuel` / `ever_lit` / `drain`)
  - `tests/unit/step.test.ts` (12 tests: hao hụt dầu nguyên `1/60`, tắt đèn `lantern_out`, thắp lại `5` đom đóm `+40`, châm dầu `used = min(carried, ceil((100-fuel)/10))`, bỏ qua đèn đầy `100`, mất vùng an toàn `< 30` và giữ đúng ở `= 30`, Bóng Mực `wander -> drain` hút `5/s` & `fuel_drain` mỗi `60` tick, `+15` điểm Tỏa Sáng, đẩy mép `6 m` khi châm từ `< 30 -> >= 30`, sức chứa `10 -> 20`, ưu tiên `no_flames` trên tick cuối, thắng `dawn_survived` theo `ceil(0.6 * total)`)
  - `tests/unit/clientInput.test.ts` (2 tests)
  - `tests/contract/headless.test.ts` (4 tests: từ chối input/scenario sai v1.2 exit code `2`, `--night 1|2|3` và exit `1` trên `--night 4`, Đêm 3 mặc định `18,000` ticks & stress `21,600` ticks dưới `30s` tất định 100%)
- **Code Slop / UI Quality Check (`impeccable detect --json`):** `[]` (0 cảnh báo).

---

## 2. Kết quả Kịch bản Headless Phase 1–3 (`Contract v1.2`)

| Kịch bản | Đêm | Mục tiêu kiểm chứng | Kết quả quan sát |
|---|---|---|---|
| `win-all-lit` (Phase 1 reg. → v1.2) | 1 | Thu đom đóm, Tỏa Sáng, thắp `L1` & `L2`, giữ đủ sáng đến hết `time_left_s=3.2` (`dawn_survived`) | **PASS** (`ticks=192, score=1110`) |
| `loss-no-flames` (Phase 1 reg.) | 1 | Mất Ngọn Lửa cuối từ Bóng Mực -> thua `no_flames` | **PASS** (`ticks=16`) |
| `loss-dawn` (Phase 1 reg.) | 1 | Hết giờ khi chưa đủ đèn -> thua `dawn` | **PASS** (`ticks=12`) |
| `fall-edge` (Phase 1 reg.) | 1 | Rơi khỏi đảo `Y < -10` -> `-1` Ngọn Lửa, mất hết đom đóm (`lost=4`), hồi sinh `[0,0,0]` | **PASS** (`tick=66, lost=4`) |
| `dash` (Phase 2) | 1 | Lướt giữ nguyên `Y=0.5`, hồi chiêu `1.5s`, lướt lần 2 tick `97` | **PASS** (`events=6,97`) |
| `charm` (Phase 2) | 2 | Nhặt Bùa Gió `C1`, chạy `7.2 m/s`, Lướt liên tiếp 0 hồi chiêu | **PASS** (`pickedTick=7, backToBackDashes=2`) |
| `drifter` (Phase 2) | 2 | Gió Lạc cướp `3`, trúng Tỏa Sáng rơi `3` | **PASS** (`stealTick=9, dropTick=26`) |
| `night2-bridge-jump` (Phase 2 → v1.2) | 2 | Bục nhảy `(20,0,18)` + Cầu tre `(x=35)`, thắp `L2` và trụ qua bình minh (`time_left_s=10.5`) | **PASS** (`airJump=true, bridgeWalk=true, endTick=630`) |
| `night3-tiers-wind` (Phase 2) | 3 | Dốc `30°` lên Tầng 1, bục nhảy lên Tầng 2, chặn Tháp chuông `r>=2m`, Gió mạnh tick `1800` | **PASS** (`windActiveTick=1800`) |
| `pause-resume` (Phase 2) | 1 | Sườn lên `pause` đóng băng `sim_tick=10`, mở lại tiếp tục `sim_tick=25` | **PASS** |
| **`fuel-refuel-relight` (Phase 3)** | 1 | Bỏ qua `L2` đầy `100`, châm `L3` (`+2`->`100`), `L1` tắt `lantern_out@t48`, thắp lại `L1` tốn `5` đom đóm (`relight=true@t69`) | **PASS** (`refuel=L3 +2->100, out=L1@t48, relit=L1@t69`) |
| **`shade-drain-pulse` (Phase 3)** | 1 | Bóng `S2` đang `drain` trúng Tỏa Sáng (`+15` điểm), `S1` tự tìm `L2` yếu -> `drain` phát `fuel_drain@t76`, châm `L2 >= 30` đẩy `S1` ra `6.00m` | **PASS** (`drainStunScore=15, fuel_drain@t76, safePushDist=6.00m`) |
| **`dawn-survived-threshold` (Phase 3)** | 1 | Đêm 1 giữ đúng `3/5` (`ceil(0.6*5)=3`) đến bình minh -> `dawn_survived`, điểm `3*(50+79) + 3*50 = 537` | **PASS** (`reason=dawn_survived, score=537`) |
| **`capacity-scaling` (Phase 3)** | 1 | Sau khi tự thắp 1 đèn, `capacity` tăng `10 -> 12`, nhặt tối đa `12/13` đom đóm còn lại `1` | **PASS** (`capacity=12, carried=12, leftoverMotes=1`) |
| Determinism & Benchmark `21,600` ticks | 1, 2, 3 | Hai lần chạy `--seed 42 --night 1|2|3` giống nhau 100%; `21,600` tick Đêm 3 CLI hoàn tất ≤ 30s | **PASS (`21600 ticks` in `2393ms <= 30000ms`)** |

---

## 3. Kiểm thử Trực tiếp trên Trình duyệt (`1280×720`, Vite Preview `http://127.0.0.1:4173/`)

Kiểm tra tương tác thực tế qua subagent trình duyệt tại viewport `1280×720`:
- **Lỗi Console / Page Errors:** **0 lỗi** trong suốt quá trình chuyển qua Menu chính, Đêm 1, Pause/Settings, tải lại trang, Menu Settings và Đêm 3.
- **Menu chính & Luật Phase 3:** Hiển thị rõ 3 thẻ Đêm `04:00 (Giữ ≥ 3/5)`, `04:30 (Giữ ≥ 4/6)`, `05:00 (Giữ ≥ 5/7)` không đè chữ hay tràn khung.
- **Chế độ Mù màu (`Bảng màu dễ phân biệt`) & Lưu `localStorage`:** Bật `#input-colorblind` gán lớp `.is-colorblind` lên `<body>`; sau `page.reload()`, trạng thái bật và `.is-colorblind` vẫn được giữ nguyên.
- **Độ mượt trên Đêm 3 (`≥ 30 FPS`):** Ảnh chụp xác nhận của host (`final_step_18.png` trong vùng Pause Đêm 3) ghi nhận trực tiếp hiển thị `#pause-sub`: **"Đêm 3 · Đảo Chuông (39 FPS) vẫn lặng lẽ đợi ánh lửa từ bạn."** (**39 FPS ≥ 30 FPS**).
