# Nhật ký Dùng AI & Đánh giá Phase 1–4

## 1. Quy trình làm việc với AI

### Phase 1 (`phase-1`, Contract `v1.0`)
1. **Brainstorming & Spec:** Phân tích PRD-0 + Test Contract v1.0, rà soát spec bằng subagent độc lập.
2. **Planning & TDD:** Triển khai `src/sim/` (`world.ts`, `step.ts`, `runner.ts`) + `src/headless/` bằng TDD (RED → GREEN), sau đó xây dựng client Three.js.
3. **Verify & Independent Review:** Chạy `npm run build && npm run verify`, kiểm thử trình duyệt và merge PR #1 -> tag `phase-1`.

### Phase 2 (`phase-2`, Contract `v1.1`)
1. **Harness & Spec trước khi code:** Cập nhật [`AGENTS.md`](AGENTS.md), skill [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md) và đặc tả [`2026-11-20-phase2-design.md`](../superpowers/specs/2026-11-20-phase2-design.md) gồm Acceptance Criteria `AC-P2-1..7`.
2. **TDD theo từng module `sim` & `headless`:** Xây dựng [`maps.ts`](../../src/sim/maps.ts) (`Đêm 1–3`, địa hình phân tầng, dốc, cầu tre, tháp chuông), nâng cấp `world.ts`, quy trình 12 bước `step.ts` (Lướt, Bùa Gió, Gió Lạc, Gió mạnh, Rơi mất toàn bộ đom đóm + 60 tick chờ, Tạm dừng), `validate.ts` và `cli.ts` hỗ trợ `--night 1|2|3`.
3. **Client Phase 2 & UI Polish:** Chuẩn hóa bảng màu [`palette.ts`](../../src/client/palette.ts), dựng 3D Đêm 2 (`Đảo Cau`, cầu tre, bục nhảy, cây cau) & Đêm 3 (`Đảo Chuông`, 3 tầng, 2 dốc, Tháp chuông), chuỗi Menu → Intro (Ông Đăng) → Chiến dịch 3 Đêm → Pause/Settings (`localStorage`) → Dawn Victory, tối ưu HUD (`setHtmlIfChanged`) và chạy `impeccable detect` (0 cảnh báo).
4. **Verification Gate & Browser Playtest:** Viết 6 kịch bản Phase 2 trong `docs/proof/phase2-scenarios/`, nâng cấp [`verify-all.mjs`](../../scripts/verify-all.mjs) và kiểm tra trình duyệt trực tiếp tại `1280×720`.

### Phase 3 (`phase-3`, Contract `v1.2`)
1. **Change Request & ADR:** Phân tích TICKET-03 ("Đèn cạn dầu"), lập [`2026-11-20-phase3-design.md`](../superpowers/specs/2026-11-20-phase3-design.md) kèm **ADR-001** (dùng số nguyên `1/60` `fuelTicks: 0..6000`), [`CHANGELOG.md`](../../CHANGELOG.md) và kế hoạch TDD [`2026-11-20-phase3-lantern-fuel.md`](../superpowers/plans/2026-11-20-phase3-lantern-fuel.md).
2. **TDD nâng cấp Sim & Headless:** Cập nhật `game.contract.json` (`1.2`), `constants.ts`, `types.ts`, `world.ts`, `step.ts`, `validate.ts`; nâng cấp toàn bộ test `all_lit`/điểm cũ sang `dawn_survived` và viết 27 unit/contract test pass không skip.
3. **Client 3D & Mù màu:** Đèn tắt xẹp `20%` kèm dải rách, thanh dầu 3D nổi, nhấp nháy `1 Hz` khi `fuel < 30`, Bóng Mực `drain` kèm tia hút, HUD động `10..20` đom đóm, nút `"Bảng màu dễ phân biệt"` (`#00B3FF` + `#FFFFFF` + `⚠`) lưu `localStorage`, cùng SFX `refuel`/`lantern_out`/`fuel_drain`.
4. **Verify Gate & Browser QA:** Tạo 4 kịch bản Phase 3 (`fuel-refuel-relight`, `shade-drain-pulse`, `dawn-survived-threshold`, `capacity-scaling`), chạy 14 kịch bản + benchmark `21,600` ticks và kiểm chứng trực tiếp ở `1280×720`.

### Phase 4 — "Bình minh: phát hành v1.0.0" (Contract `v1.3`)
1. **Contract & App Runtime (`run` / `bench` / `soak`):** Viết ADR-002 chốt kiến trúc `dist-app/{run,bench,soak}.mjs` với TDD (`tests/contract/appCli.test.ts`), bổ sung lưu/xuất Bảng xếp hạng cục bộ (`--export-leaderboard`), cảnh benchmark `createBenchWorld(seed)` và chạy thử dài hạn `10` đêm (`soak.mjs`).
2. **Tối ưu GPU 1280×720 (`12.4 → 1113.6 FPS`):** Phân tích triệt để điểm nghẽn Intel Iris Xe qua ablation thực nghiệm; loại bỏ `EffectComposer`/`ACESFilmicToneMapping`, gộp lưới Mây (`mergeParts`), chuyển toàn bộ đèn/cây/mây/200 Bóng/100 Đom đóm sang `InstancedMesh` và chuyển ANGLE Windows sang `use-angle=gl`.
3. **Trợ năng & Đổi phím (`>= 18px`):** Chuẩn hóa cỡ chữ nền `>= 18px`, thêm nút `Chữ lớn ×1.25`, `Giảm chuyển động`, đổi đủ 9 phím điều khiển kèm kiểm tra trùng phím/khôi phục mặc định và tách mũi tên chỉ hướng HUD khỏi chồng chéo.
4. **Đóng gói, Demo & Nghiệm thu 7/7:** Nâng `scripts/verify-all.mjs` lên cổng `7/7`, thêm `Dockerfile` + `scripts/package-release.mjs` (`dao-den-long-v1.0.0-web.zip`), quay `docs/demo/demo.mp4` (`1280×720`) qua Electron + `ffmpeg-static` và hoàn thiện tài liệu phát hành.

---

## 2. Các lỗi AI gặp phải & Cách phát hiện / Khắc phục

| Giai đoạn | Lỗi phát sinh | Cách phát hiện | Cách khắc phục |
|---|---|---|---|
| Phase 1 | Nhầm chiều `KeyD` (`move: [1,0]`) trong camera Y-up | Kiểm tra tích có hướng & unit test `rx === -fz` | Đổi sang `D -> [-1,0]`, `A -> [1,0]` và khóa bằng test góc `45°` |
| Phase 1 | Thiếu `vite/client` types khiến `import './style.css'` báo `TS2882` | `npm run build` (`tsc --noEmit`) | Thêm `src/vite-env.d.ts` |
| Phase 2 (Client) | Nút Pause gọi `stepTick` 1 lần khiến `state.prevPause` giữ nguyên `true`, dẫn đến không thể Resume từ Pause UI | Trace tay sườn lên `pausePressed` trong `step.ts` trước khi chạy | Gọi nhả `pause: false` ngay sau khi pause để `prevPause` reset về `false` |
| Phase 2 (UI/HUD) | Top HUD ở Đêm 3 (7 đèn) bị xuống dòng ở `1280px` và cảnh báo `side-tab` từ `impeccable detect` | Kiểm tra `final_step_23.png` + `impeccable.cmd detect --json` | Đổi `.hud-top` thành `flex` dàn ngang 1 hàng (`1240×39px`) và đổi viền `.intro-quote` sang border mảnh đều 4 cạnh (`[]` slop) |
| Phase 2 (FPS / Telemetry) | Phép tính trung bình `mean(1/dt)` kết hợp DOM `innerHTML` mỗi frame làm số đo FPS nhảy bất ổn khi đổi màn (`17 FPS` -> `109 FPS`) | Kiểm chứng `#pause-sub` trên trình duyệt ở Đêm 2 & Đêm 3 | Thêm cache DOM `setHtmlIfChanged` trong `hud.ts` và tính harmonic mean `N / sum(dt)` trên các frame chơi thực tế |
| Phase 2 (Scenarios) | Scenario Đêm 3 đi đường thẳng nối `(16.6, 9.5) -> (0, 13)` cắt qua khoảng trống `r < 12` làm rơi xuống sân `Y=0` thay vì vào bục nhảy `(0,3,13)` | Đọc snapshot `out-night3-tiers-wind.jsonl` | Điều hướng theo vòng cung `r ~ 20 m` trên Tầng 1 trước khi rẽ vào bục nhảy `(0, 3, 13)` |
| Phase 2 (Review) | Kẽ hở va chạm vách đá `0.2m` (`5.65` vs landing `5.85`), `prevPause` chưa nhả ở nhánh Resume trên màn hình tần số quét cao & benchmark 21,600 tick thiếu assert đủ số tick | Independent Branch Reviewer (`main..HEAD`) | Chỉnh ngưỡng vách `2.85 / 5.85` trong `maps.ts`, nhả `prevPause` + chặn `e.repeat` ở `main.ts`, đồng bộ cao độ Gió Lạc, dispose GPU buffer và assert `ticks === 21600` |
| Phase 3 (Sim/Scenarios) | Scenario đặt `fuel=100` giảm xuống `5999` (`99.983`) ở Bước 2 trước Bước 5 tương tác, cộng benchmark `bench` không truyền `time_left_s: 360` nên dừng ở `18,000` ticks (thời lượng Đêm 3 mới `300s`) | Unit test đèn đầy & chạy `verify-all.mjs` bước 6 | Bỏ qua đèn có `fuelTicksToValue(fuelTicks) >= 100` (`used=0`) trong `step.ts`, và truyền `time_left_s: 360` cho stress benchmark `21,600` ticks |
| Phase 3 (Review) | Tia hút `drain` 3D thiếu mesh nối Bóng–Đèn, dải rách đèn tắt bị chìm trong Octahedron `0.54`, scenario `{ lit: true, fuel: 0 }` không reset `deposited=0`, màu mù màu còn sót ở CSS vignette/hit burst & thiếu `blur` + chuyển `result` khi resume | Independent Branch Reviewer (`main..HEAD`) | Thêm mesh `drainBeam` & hạt `fuel_drain`, đẩy dải rách ra mặt xiên `r=0.41`, reset `deposited=0` khi `fuel<=0` (TDD), đồng bộ `.is-colorblind` CSS/3D, xử lý `blur` & `handleTerminalState()` |
| Phase 4 (Bench/Soak) | Electron `45.4.1` thoát mã `-1` khi truyền cờ CLI tùy biến trực tiếp; ANGLE D3D11 DXGI nghẽn (`12.4 FPS`) cùng `UnrealBloomPass` + 149 draw calls; `soak.mjs` nhiễu `mem_start_mb` do JIT lần đầu & `bench` chạy `sortedIds()` lặp mỗi frame | Ablation có hệ thống trên Electron GL/D3D11 + Node V8 `--expose-gc` | Truyền cấu hình qua env `DDL_BENCH_*`; gộp `InstancedMesh` + `NoToneMapping` + `use-angle=gl` đạt `1113.6 FPS` (`p1_low=33`); pre-sort ID trong `createBenchWorld`; prewarm `2,000` ticks trong `soak` (`43 → 38 MB`) |
| Phase 4 (UI/Demo) | Hai mũi tên chỉ hướng `#hud-lantern-arrow` và `#hud-shade-arrow` chồng lên nhau khi cùng góc nhìn; `record-demo.mjs` xuất `1280×772` do DPI Windows & chưa đặt `frame: false` | Kiểm tra trực quan bằng `read_file` trên `screenshot.png` & khung hình `ffmpeg` | Chống chồng chéo vị trí 2 mũi tên trong `hud.ts`; bật `frame: false` + `force-device-scale-factor=1` xuất chuẩn `1280×720` |

---

## 3. Quản lý Token & Ước tính Chi phí

> Lưu ý: Các con số token và chi phí USD dưới đây là **ước tính tham khảo** dựa trên độ dài phiên làm việc và số lượt công cụ, không phải số liệu hóa đơn API trực tiếp.

- **Phase 1:** ~65k–85k input tokens, ~18k–24k output tokens (~`$0.35–$0.65`).
- **Phase 2:** ~110k–140k input tokens (3D 3 Đêm, HUD/Menu/Settings, 10 kịch bản headless & kiểm thử trình duyệt), ~35k–45k output tokens (~`$0.65–$1.00`).
- **Phase 3:** ~95k–120k input tokens (Contract `v1.2`, số nguyên `fuelTicks`, AI `drain`, UI/mù màu, 14 kịch bản & browser QA), ~28k–36k output tokens (~`$0.50–$0.80`).
- **Phase 4:** ~150k–190k input tokens (Runtime `run`/`bench`/`soak`, ablation tối ưu GPU WebGL/ANGLE từ `12.4` lên `1113.6 FPS`, trợ năng `>= 18px` + đổi 9 phím, đóng gói Docker/Zip, quay `.mp4` & rà soát độc lập), ~45k–60k output tokens (~`$0.85–$1.35`).
- **Tổng cả 4 Phase (ước tính):** ~420k–535k input tokens, ~126k–165k output tokens (~`$2.35–$3.80`).
- **Tối ưu áp dụng:** Cập nhật có mục tiêu theo Code Map (`StartLine`/`EndLine`), dùng `scripts/verify-all.mjs` làm cổng nghiệm thu 1 lệnh duy nhất, dùng model nhẹ (`flash`) cho kiểm thử trình duyệt và cô lập kiểm thử benchmark GPU bằng script nhỏ thay vì sửa thử mù trên repo.
