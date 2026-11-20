# Nhật ký Dùng AI & Đánh giá Phase 1–2

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

---

## 3. Quản lý Token & Ước tính Chi phí

- **Phase 1:** ~65k–85k input tokens, ~18k–24k output tokens (~`\$0.35–\$0.65`).
- **Phase 2:** ~110k–140k input tokens (bao gồm 3D 3 Đêm, HUD/Menu/Settings, 10 kịch bản headless & kiểm thử trình duyệt lặp lại), ~35k–45k output tokens (~`\$0.65–\$1.00`).
- **Tối ưu áp dụng:** Cập nhật có mục tiêu theo Code Map (`StartLine`/`EndLine`), tự động chạy `scripts/verify-all.mjs` làm cổng nghiệm thu 1 lệnh duy nhất, dùng `browser` model nhẹ (`flash`) cho kiểm thử trực quan thay vì chạy lại toàn bộ agent nặng.
