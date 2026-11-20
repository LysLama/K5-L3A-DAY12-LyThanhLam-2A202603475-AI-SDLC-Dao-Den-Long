# CHANGELOG — Breaking Changes & Upgrades

## [1.0.0 · Phase 4 — Contract v1.3] - 2026-11-20 (TICKET-04 "Bình minh: phát hành v1.0.0")

### Added (Tính năng phát hành, Hiệu năng, Độ bền & Trợ năng)
1. **Chế độ Benchmark chuẩn (`bench_cmd`):**
   - Lệnh `node dist-app/bench.mjs --seed 42 --duration 30 --out bench.json` mở cửa sổ Electron `1280×720` (không toàn màn hình, tắt VSync qua `disable-gpu-vsync` + `disable-frame-rate-limit` + `use-angle=gl`), tải Đêm 1 với đúng `200` Bóng Mực `wander`, `100` đom đóm, `3` đèn `L1–L3` sáng ở `fuel = 100`, tắt sinh/sát thương/nhặt/hao dầu/kết thúc Đêm, quay camera tròn bán kính `30 m`, độ cao `Y = 15 m`, `15 s`/vòng ngược chiều kim đồng hồ quanh `(0, 0, 0)`.
   - Khởi động `3 s` rồi đo đúng `--duration` giây, xuất `bench.json` chuẩn Contract `v1.3` (`avg_fps = 1113.6 >= 60`, `p1_low_fps = 33 >= 30`, `frame_ms_p95 = 1.1`, `load_ms = 484 <= 10000`, `vsync_off = true`).
2. **Kiểm thử Chịu tải Dài hạn (`soak_cmd`):**
   - Lệnh `node dist-app/soak.mjs --seed 7 --nights 10 --out soak.json` chạy tuần hoàn Đêm 1 → 2 → 3 trong `10` đêm bằng bot tất định, prewarm V8 JIT `2,000` ticks và kiểm tra rò rỉ bộ nhớ RSS (`0` crash, `43 MB -> 38 MB` trong `0.3 s`).
3. **Tối ưu Render GPU (`sceneBuilder.ts` & `main.ts`):**
   - Gộp toàn bộ Đèn Lồng Lớn (đế, mái, lõi, vết rách, tinh thể, lửa, hào quang, nhẫn an toàn, thanh dầu, đom đóm quay) và Bóng Mực + Mây + cây cối vào `InstancedMesh` + hình học gộp `vertexColors`; loại bỏ `EffectComposer`/`UnrealBloomPass` & `ACESFilmicToneMapping` khỏi vòng lặp khung hình để giữ chất lượng sáng rõ ở >60 FPS trên GPU tích hợp.
4. **Bảng Xếp Hạng Cục Bộ (`run_cmd` + HTTP API + UI):**
   - Máy chủ Node tích hợp (`node dist-app/run.mjs`) phục vụ game tĩnh và `/api/leaderboard` đọc/ghi `~/.dao-den-long/leaderboard.json` (tối đa Top 10, sắp theo điểm giảm dần, trùng điểm ưu tiên đạt trước theo ISO-8601 có múi giờ); hỗ trợ `--export-leaderboard <out.json>`, `--host`, `--port`, `--no-open` và fallback `localStorage`.
   - Màn hình kết thúc (`screen-result`) cho phép nhập tên (`3–12` ký tự `[A-Za-z0-9_]` gồm chữ có dấu) và xem Bảng xếp hạng ngay từ Menu chính.
5. **Trợ năng (Accessibility):**
   - **Tùy chỉnh toàn bộ `9` phím điều khiển** kèm phát hiện trùng phím & nút `"Khôi phục mặc định"`.
   - **Chế độ Giảm chuyển động** (tắt rung camera khi va chạm/pulse/thắp đèn và tắt hiệu ứng chuyển động CSS) + **Chữ lớn `×1.25`** (`>= 22.5px`, mặc định nền `>= 18px`) lưu bền vững qua `localStorage`.
6. **Phát hành & Vận hành:**
   - Hoàn thiện [`Dockerfile`](Dockerfile), [`.dockerignore`](.dockerignore), [`scripts/package-release.mjs`](scripts/package-release.mjs) (`dao-den-long-v1.0.0-web.zip`), [`scripts/record-demo.mjs`](scripts/record-demo.mjs) (`docs/demo/demo.mp4` + `docs/demo/screenshot.png`), nâng cấp [`scripts/verify-all.mjs`](scripts/verify-all.mjs) lên cổng `7/7` (`v1.3`), tận dụng CI [`.github/workflows/ci.yml`](.github/workflows/ci.yml) chạy `npm run verify`, cập nhật `CHANGELOG.md`, `CREDITS.md`, `LICENSE` (MIT) và tổng kết [`docs/notes/retro.md`](docs/notes/retro.md).

## [Phase 3 — Contract v1.2] - 2026-11-20 (TICKET-03 "Đèn cạn dầu")

### Breaking Changes (Thay đổi phá vỡ tương thích so với Contract v1.1 / Phase 2)
1. **Điều kiện thắng (`[THAY THẾ] all_lit -> dawn_survived`):**
   - Thắp đủ đèn không còn kết thúc Đêm ngay lập tức. Event `game_over` với `reason: "all_lit"` **bị loại bỏ**.
   - Thay bằng thắng khi hết thời gian Đêm (`dawn_survived`) nếu Mây còn sống (`flames > 0`) và số đèn đang sáng `>= ceil(0.6 * total)` (`3/5` Đêm 1, `4/6` Đêm 2, `5/7` Đêm 3).
   - Nếu hết Ngọn Lửa ngay ở tick bình minh, vẫn xử lý thua `no_flames` trước.
2. **Thời lượng Đêm rút ngắn:**
   - Đêm 1: `300 s -> 240 s` (`night1_duration_s`)
   - Đêm 2: `330 s -> 270 s` (`night2_duration_s`)
   - Đêm 3: `360 s -> 300 s` (`night3_duration_s`)
3. **Nhiên liệu đèn & tắt đèn (`[THAY THẾ]`):**
   - Đèn vừa thắp bắt đầu ở `fuel = 100`, tự hao `1.0/s` (`1/60` mỗi tick). Về `<= 0` đèn tắt (`lit: false, fuel: 0, deposited: 0`), phát `lantern_out`, giữ `ever_lit: true`.
   - Thắp lại đèn đã từng sáng (`ever_lit: true`) chỉ tốn `5` đom đóm (`relight_cost`) thay vì `10`.
   - Đèn sáng chưa đầy dầu (`fuel < 100`) nhận châm dầu (`10 fuel/mote`) qua tương tác (`refuel`); đèn đầy (`fuel == 100`) không được chọn.
4. **Vùng an toàn `6 m` phụ thuộc mức dầu (`[THAY THẾ]`):**
   - Đèn sáng có `fuel < 30` **mất vùng an toàn `6 m`** (tại đúng `30.0` vẫn còn). Bóng Mực `wander` chủ động tiến tới đèn yếu để `drain` (`5/s`), và chỉ về `wander` / bị đẩy `30` tick khi đèn tắt hoặc châm lên `>= 30`.
5. **Công thức tính điểm (`[THAY THẾ]`):**
   - Bỏ thưởng thời gian còn lại (`per_second_left`).
   - Nạp/châm mỗi đom đóm: `+10 -> +5` (`per_mote`).
   - Thắp lần đầu: `+100`; Thắp lại (`ever_lit`): `+40` (`per_relight`).
   - Tỏa Sáng: `+5` mỗi Bóng thường; tổng `+15` nếu Bóng đang `drain`.
   - Bình minh thắng (`dawn_survived`): `+50 + floor(fuel)` mỗi đèn đang sáng, `+50` mỗi Ngọn Lửa còn lại.
6. **Schema Contract `v1.2` (Snapshot / Scenario / Events):**
   - Snapshot bổ sung: `player.capacity`, `lanterns[].{fuel, ever_lit, relit_count}`, trạng thái shade `drain`.
   - Scenario bổ sung: `player.successful_lights`, `lanterns[].{lit, fuel, ever_lit}`, `shades[].target_lantern_id`.
   - Events bổ sung/thay đổi: `refuel`, `lantern_out`, `fuel_drain`, `lantern_lit.data.relight`, `game_over.data.reason = "dawn_survived"`.

### Added (Tính năng mới tương thích ngược)
- **Sức chứa tăng dần:** `capacity = min(20, 10 + 2 * successful_lights)` đặt lại về `10` đầu mỗi Đêm.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Lưu trong `localStorage`; chuyển Bóng Mực sang `#00B3FF`, cảnh báo UI sang `#FFFFFF + ⚠`, đèn tắt xẹp `20%` kèm vết rách, đèn yếu nhấp nháy `1 Hz`.
