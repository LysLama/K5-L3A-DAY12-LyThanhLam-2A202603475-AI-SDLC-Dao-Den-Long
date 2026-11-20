# Phase 4 Release Design Spec & ADR-002 — TICKET-04: "Bình minh: phát hành v1.0.0" (Contract v1.3)

- **Ngày:** 2026-11-20
- **Tag mục tiêu:** `phase-4` + **GitHub Release `v1.0.0`**
- **Contract:** `v1.3`
- **Mục tiêu:** Đưa **Đảo Đèn Lồng** đạt chuẩn phát hành `v1.0.0`: đo được hiệu năng 3D chuẩn (`bench_cmd`), ổn định bộ nhớ qua `10` Đêm liên tiếp (`soak_cmd`), bảng xếp hạng lưu đĩa cục bộ & xuất CLI (`run_cmd --export-leaderboard`), bộ tùy chọn tiếp cận đầy đủ (đổi phím 9 hành động + phát hiện trùng, phụ đề/chỉ báo hướng Bóng Mực/gió/`10s`/đèn `<30`, giảm chuyển động, chữ tối thiểu `18px` + `×1.25`), đóng gói đa nền tảng (`<= 3` lệnh, Release `v1.0.0`, `CREDITS.md`, `LICENSE`, `CHANGELOG.md`, `demo.mp4` `< 5` phút, Retro 4 phase).

---

## 1. Kiến trúc Quyết định (ADR-002)

### 1.1 Công cụ chạy Cửa sổ Benchmark (`bench_cmd`: `node dist-app/bench.mjs`)
- **Các phương án đã xét:**
  1. *Electron (`electron` + `app.commandLine.appendSwitch`)* (**Đã chọn**)
  2. *Playwright/Puppeteer Chromium*: phải tải `chrome-for-testing` (~180–280 MB) hoặc phụ thuộc Chrome/Edge cài sẵn của OS; ngoài ra cửa sổ trình duyệt thông thường khó lấy chính xác tổng OS RSS của cả Main + GPU + Renderer đa nền tảng nếu không viết mã dò PID riêng cho từng OS.
- **Lý do chọn Electron cho `bench_cmd`:**
  - `npm ci` tự động tải binary Chromium/Electron chuẩn trên Windows, macOS và Linux (không cần bước `playwright install` thứ 4, bảo toàn giới hạn `<= 3` lệnh).
  - Bật cờ Chromium `disable-gpu-vsync`, `disable-frame-rate-limit`, `disable-renderer-backgrounding` trước `app.whenReady()`, mở cửa sổ thật `1280×720` (`useContentSize: true`, `fullscreen: false`), lấy RSS chính xác xuyên suốt phiên qua `app.getAppMetrics()` (`workingSetSize`) để xuất `peak_mem_mb` số thực (không phải `null`).
  - Đọc dữ liệu thực tế `vsync_off` khi thoát; nếu OS compositor (ví dụ Windows DWM hoặc macOS Metal) vẫn kẹp `requestAnimationFrame` ở tần số quét màn hình, ghi trung thực kết quả trong `bench.json` và giải thích rõ trong `README.md`.

### 1.2 Tối ưu Kết xuất 200 Bóng Mực + 100 Đom đóm (`InstancedMesh` GPU Batching)
- **Vấn đề:** Trước Phase 4, mỗi Bóng Mực tạo 9 mesh rời (`~1,800` draw calls cho 200 Bóng Mực) và mỗi đom đóm tạo 1 khối cầu + 1 `THREE.Sprite` (`~200` draw calls), dễ tụt dưới `60 FPS` khi gộp `UnrealBloomPass`.
- **Quyết định:** Thay Bóng Mực và Đom đóm trong [`src/client/sceneBuilder.ts`](../../src/client/sceneBuilder.ts) bằng `THREE.InstancedMesh` dung lượng trước (`maxShades = 256`, `maxMotes = 256`, cập nhật `count` mỗi frame):
  - **Bóng Mực:** 5 `InstancedMesh` cho thân, sừng, mắt, tua khói và sao choáng (`stun`) + 1 `InstancedMesh` cho tia hút `drain`. Toàn bộ 200 Bóng Mực còn **4–6 draw calls** nhưng giữ nguyên 100% hình khối, animation, trạng thái `stunned`/`recoil`/`drain`, và màu mù màu `#00B3FF`.
  - **Đom đóm:** 2 `InstancedMesh` cho hạt lõi vàng (`moteCoreInst`) và vầng sáng additive hướng camera (`moteHaloInst`) → **2 draw calls** cho toàn bộ 100 đom đóm.

### 1.3 Bảng xếp hạng Cục bộ & Lệnh `<run_cmd> --export-leaderboard out.json`
- **Các phương án đã xét:**
  1. *Chạy máy chủ Node HTTP + REST `/api/leaderboard` lưu file JSON trên đĩa (`dist-app/run.mjs`) + sao lưu `localStorage`* (**Đã chọn**)
  2. *Chỉ lưu `localStorage` trong trình duyệt*: Không thể đọc từ CLI `--export-leaderboard out.json` khi đóng game và chạy độc lập trên terminal.
- **Thiết kế chi tiết:**
  - Logic validate tên, sắp xếp & cắt Top 10 đặt chung trong [`src/shared/leaderboard.ts`](../../src/shared/leaderboard.ts) (dùng chung cho client, Node server và unit test).
  - File lưu mặc định trên đĩa: `path.join(os.homedir(), '.dao-den-long', 'leaderboard.json')` (cho phép ghi đè qua biến môi trường `DDL_LEADERBOARD_PATH` hoặc cờ `--leaderboard-file <path>` khi chạy test để không làm bẩn thư mục người dùng/repo).
  - Sau màn **Bình Minh** (thắng Đêm 3) hoặc **Thua ở bất kỳ Đêm nào**, màn kết quả hiển thị ô nhập tên + nút lưu điểm (gửi `POST /api/leaderboard` ghi xuống đĩa; đồng thời hỗ trợ mở màn hình **Bảng xếp hạng** từ Menu chính).
  - Quy tắc tên: `3–12` ký tự, chấp nhận `[A-Za-z0-9_]` và chữ cái tiếng Việt có dấu (`/^[\p{L}0-9_]{3,12}$/u`, trim trước khi kiểm tra), ghi chú validation rõ ràng nếu không hợp lệ.
  - Sắp xếp Top 10: `score` giảm dần (tổng điểm các Đêm đã thắng trong lượt chơi, `0` nếu thua ngay Đêm 1); bằng điểm thì `achieved_at` (ISO 8601 có múi giờ `±HH:MM`) sớm hơn đứng trên.
  - `run_cmd` trong `game.contract.json` (`node dist-app/run.mjs`):
    - Không truyền `--export-leaderboard`: khởi chạy máy chủ phục vụ `dist/` + `/api/leaderboard` và mở trình duyệt mặc định (hỗ trợ `--no-open`, `--port <n>`).
    - Có `--export-leaderboard <out.json>`: đọc file đĩa hiện tại, sắp xếp/chuẩn hóa Top 10, ghi `{"entries": [...]}` ra `<out.json>` và thoát mã `0`.

---

## 2. Hợp đồng & Chỉ tiêu Kỹ thuật (`Contract v1.3`)

- **`game.contract.json` (`contract_version: "1.3"`):** Giữ nguyên toàn bộ `tuning` của `v1.2`, thêm:
  - `"run_cmd": "node dist-app/run.mjs"`
  - `"headless_cmd": "node dist-headless/cli.mjs"`
  - `"bench_cmd": "node dist-app/bench.mjs"`
  - `"soak_cmd": "node dist-app/soak.mjs"`
- **Cảnh Benchmark (`--seed 42 --duration 30 --out bench.json`):**
  - Cửa sổ `1280×720` (`fullscreen: false`), tắt VSync (`disable-gpu-vsync`, `disable-frame-rate-limit`), Đêm 1 đầy đủ ánh sáng & `UnrealBloomPass`.
  - Chính xác `200` Bóng Mực (`wander`, phân bố đều theo `seed 42`) + `100` đom đóm + `L1–L3` sáng (`fuel = 100`). Tắt sinh thực thể mới, sát thương, nhặt đom đóm, hao dầu, điều kiện kết thúc. Bóng Mực chạy `wander` bình thường (không đuổi Mây). Mây đứng yên tại `(0, 0, 0)`.
  - Camera bay vòng tròn tâm `(0, 0, 0)`, bán kính `30 m`, độ cao `Y = 15 m`, luôn nhìn `(0, 0, 0)`, bắt đầu góc `0°` tại `(30, 15, 0)`, quay ngược chiều kim đồng hồ nhìn từ trên xuống (`x = 30 cos(θ), z = -30 sin(θ)` với `θ = 2π t / 15`), chu kỳ `15 s`.
  - `3 s` khởi động không đo + `--duration` giây đo → ghi `bench.json` đầy đủ 10 trường bắt buộc (`contract_version: "1.3"`, `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `frames`, `load_ms`, `peak_mem_mb`, `vsync_off`, `renderer`, `os`) và thoát `0`.
- **Soak Test (`<soak_cmd> --seed 7 --nights 10 --out soak.json`):**
  - Chạy trong một tiến trình duy nhất qua `--nights` Đêm xoay vòng `1 → 2 → 3` (`seed = baseSeed + i` với `i = 0..nights-1`), giải phóng tham chiếu cuối mỗi Đêm.
  - Input ngẫu nhiên xác định theo seed: đổi hướng mỗi `30` tick; xác suất mỗi tick: `5%` nhảy, `3%` lướt, `2%` tỏa sáng, `10%` tương tác.
  - Ghi `mem_start_mb` (RSS ngay khi khởi tạo xong Đêm 1) và `mem_end_mb` (RSS sau khi kết thúc & reset Đêm cuối), đảm bảo `crashes: 0` và `mem_end_mb <= 1.2 * mem_start_mb`.
- **Trợ năng (Accessibility):**
  1. **Đổi phím 9 hành động:** Tiến, Lùi, Trái, Phải, Nhảy, Lướt, Tương tác, Tỏa Sáng, Tạm dừng; phát hiện & cảnh báo ngay khi trùng phím (không cho gán đè im lặng), nút `"Khôi phục mặc định"`, lưu `localStorage`, đồng bộ nhãn phím lên HUD & thanh điều khiển.
  2. **Phụ đề / chỉ báo hình ảnh:** Vùng phụ đề trực quan trên HUD + mũi tên chỉ hướng ở mép màn hình khi **Bóng Mực xuất hiện** (`shade_spawned`), khi **gió sắp thổi** (`wind.warning`), **10 s cuối**, và **đèn có `fuel < 30`**.
  3. **Giảm chuyển động (`reduceMotion`):** Lưu `localStorage`, tắt hoàn toàn rung camera (đáp đất, trúng đòn, gió giật, dash FOV kick), tắt chớp màn hình (`.hit-vignette`, pulse flash) và dừng các animation nhấp nháy nhanh.
  4. **Cỡ chữ UI:** Mọi text HUD/menu/bảng xếp hạng/cài đặt có `font-size >= 18px` tại `1280×720`; tùy chọn **Chữ lớn (`×1.25`)** nâng cỡ chữ tương ứng (`>= 22.5px`) mà không tràn/vỡ khung ở `1280×720`.

---

## 3. Kế hoạch Phát hành & Đóng gói (`v1.0.0`)

- **Gói phát hành trên GitHub Release `v1.0.0`:**
  1. `dao-den-long-v1.0.0-web.zip`: chứa bản build tĩnh `dist/` + `dist-app/run.mjs` + `README-RUN.md` (chạy trực tiếp bằng `node run.mjs` hoặc static HTTP server bất kỳ).
  2. `Dockerfile` (kèm sẵn trong repo) + hướng dẫn chạy 1 lệnh `docker build -t dao-den-long . && docker run -p 4173:4173 dao-den-long`.
  3. `demo.mp4` (`< 5` phút, `< 100 MB`, H.264/AAC) đính kèm Release `v1.0.0` và link đặt ngay đầu `README.md`.
- **Tài liệu & Harness AI:** Cập nhật `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `.github/workflows/ci.yml` (thêm soak check), `CREDITS.md`, `LICENSE` (kiểm tra MIT), `CHANGELOG.md` (cả 4 phase), `docs/notes/phase-4-assumptions.md`, `docs/notes/ai-log.md`, `docs/notes/retro.md` (1–2 trang tổng hợp 4 phase), `docs/proof/phase-4-proof.md`, plus commit `bench.json` & `soak.json`.
