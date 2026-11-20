# Evaluation & Retrospective — Đảo Đèn Lồng (Phase 1 → Phase 4 · v1.0.0)

> Tài liệu tổng kết quá trình phát triển ứng dụng theo mô hình AI-SDLC qua 4 Phase (`Contract v1.0` → `v1.3`), các lỗi AI điển hình, hiệu quả của bộ AI Harness và chi phí vận hành ước tính.

---

## 1. Đánh giá tiến trình qua 4 Phase

| Phase | Tag | Trọng tâm kỹ thuật & Luật | Quy mô kiểm chứng | Kết quả nổi bật |
|---|---|---|---|---|
| **Phase 1** (`v1.0`) | `phase-1` | Lõi mô phỏng tất định `60 Hz` tách rời hoàn toàn khỏi Three.js (`src/sim/`), PRNG `Mulberry32`, PR -> `main` sạch | `4` kịch bản + Vitest (`24` test), JSONL `171` ticks / `92,401` bytes | Tách sạch Simulation Core ↔ Renderer ngay từ đầu giúp mọi phase sau mở rộng không vỡ headless |
| **Phase 2** (`v1.1`) | `phase-2` | Chuẩn hóa hằng số vật lý, Lướt (`14 m/s`), Tỏa Sáng (`3` đom đóm / `5 m`), Đảo Cau & Đảo Chuông, Menu/HUD 3D | `10` kịch bản + Vitest (`29` test), nâng cấp mô hình Mây & Bóng 3D | Chuẩn hóa thông số đồng bộ cảm giác điều khiển giữa người chơi và bài chấm |
| **Phase 3** (`v1.2`) | `phase-3` | Change Request *Đèn cạn dầu*: số nguyên `fuelTicks` (`1/60`), thắp lại `5`, `Bóng Mực` hút dầu `5/s`, `Chữ Tỏa Sáng` | `14` kịch bản + Vitest (`44` test), chế độ mù màu, Night 3 `21,600` ticks | Số học nguyên loại bỏ sai số số thực; ADR-001 ghi nhận đầy đủ luật `[THAY THẾ]` |
| **Phase 4** (`v1.3`) | `phase-4` / `v1.0.0` | Benchmark `1280×720` (`200` Bóng, `100` Đom đóm), Soak `10` đêm, Bảng xếp hạng HTTP/CLI, Trợ năng `>= 18px` + 9 phím, Docker/Zip | Gate `7/7`, Vitest (`13` file / `44` test), `1113.6 FPS` (`p1_low=33`), Soak `0` crash | Biến game chạy được thành sản phẩm phát hành gọn nhẹ (`190.2 KB` zip, `6` giây verify toàn phần) |

**Nhận xét tổng quát:** Kiến trúc *"Pure Deterministic Core + Thin Headless Runner + Optimized Instanced WebGL Client"* là quyết định đúng nhất trong cả 4 phase. Khi yêu cầu thay đổi sâu ở Phase 3 (nhiên liệu + thắng khi sống tới bình minh) và đo tải nặng ở Phase 4 (`200` Bóng Mực), lõi toán học không hề phụ thuộc DOM hay GPU nên thời gian chạy test logic duy trì quanh `~2.2 giây`.

---

## 2. Những lỗi AI thường gặp & Cách phát hiện / Khắc phục

1. **Tự ý giả định chi tiết kỹ thuật khi chạy thực tế trên hệ điều hành khác nhau**
   - *Hiện tượng:* Trong Phase 4, khi đóng gói `electronBench.ts`, lệnh truyền cờ `--seed 42` trực tiếp vào `electron.exe` làm Chromium hiểu nhầm cờ lạ và thoát mã `-1`; đồng thời trên Windows Intel Iris Xe, `ANGLE D3D11` dính chờ đồng bộ `DXGI` khiến FPS bị nghẽn xuống `12.4 FPS` dù phần cứng rảnh.
   - *Phát hiện:* Kiểm chứng trên tiến trình thật kết hợp thí nghiệm cô lập (`ablation` từng cờ GPU và kích thước cảnh).
   - *Khắc phục:* Chuyển cấu hình qua biến môi trường `DDL_BENCH_*`, mặc định `use-angle=gl` trên `win32`, tắt `EffectComposer`/`ACESFilmicToneMapping` tốn `13` pass blur HDR, và gộp hình học sang `InstancedMesh` -> tăng hiệu năng gần **90 lần** (`12.4` -> `1113.6 FPS`).

2. **Bỏ sót trường hợp biên ở trạng thái HUD và đồ họa 3D**
   - *Hiện tượng:* Phase 1 từng có lỗi giật mô hình nhân vật; Phase 3 reviewer độc lập phát hiện tia `drain` 3D mới có trạng thái logic mà thiếu mesh nối Bóng–Đèn, và kịch bản `fuel: 0` chưa reset `deposited = 0`; Phase 4 phát hiện khi kiểm tra ảnh thật `screenshot.png` rằng `#hud-lantern-arrow` và `#hud-shade-arrow` có thể đè nhau ở góc dưới phải.
   - *Phát hiện:* Không tin hoàn toàn vào "test xanh" — luôn kết hợp **reviewer độc lập (`research` subagent)** trên `main..HEAD` và **mắt kiểm ảnh chụp thật (`read_file` PNG + trình duyệt `1280×720`)**.

3. **Nhiễu đo lường trong `soak test` và sai lệch DPI khi quay video**
   - *Hiện tượng:* Vòng lặp Night 1 đầu tiên của `soak` chịu chi phí biên dịch JIT của V8; Electron `BrowserWindow` trên Windows DPI `125%` ban đầu xuất `1280×772` thay vì `1280×720`.
   - *Phát hiện:* Đọc JSON đầu ra thực tế và kiểm tra thông số stream của `ffmpeg`.
   - *Khắc phục:* Prewarm JIT `2,000` ticks trước khi đo `mem_start_mb` (`43 → 38 MB`) và ép `--force-device-scale-factor=1` + `frame: false` cho bộ ghi hình.

---

## 3. Bộ AI Harness hiệu quả nhất

| Công cụ / Quy ước | Vai trò thực tế | Mức độ tác động |
|---|---|---|
| **`AGENTS.md`** | Khóa chặt ranh giới `src/sim/` thuần, cấm push `upstream`, giữ parity headless và quy tắc kiểm thử trước khi kết thúc | **Rất cao** — ngăn trôi kiến trúc qua nhiều phiên |
| **`scripts/verify-all.mjs`** + Skill **`.agents/skills/verify-phase`** | Cổng nghiệm thu 1 lệnh (`1/7 → 7/7`) chạy từ TypeScript, Vitest, Contract JSON, 14 kịch bản JSONL, Benchmark `21,600` ticks, Leaderboard CLI tới Live 10-Night Soak | **Cao nhất** — phát hiện hồi quy tức thì sau mọi chỉnh sửa |
| **Test Contract + ADR (`ADR-001`, `ADR-002`)** | Buộc mọi thay đổi luật `[THAY THẾ]` hoặc lựa chọn kiến trúc đều có dấu vết lý do và test khóa chặt | **Cao** — giữ AI không tự ý sửa lại quyết định cũ |
| **Independent Review Subagent + Browser QA (`flash`)** | Rà soát độc lập `main..HEAD` trước mỗi PR và kiểm thử trực quan DOM/font/mù màu ở `1280×720` | **Cao** — bắt được các lỗi giao diện và cạnh biên mà người viết code dễ bỏ qua |
| **`impeccable` CLI (`detect --json`)** | Quét chống lỗi thẩm mỹ / anti-pattern CSS & UI tự động | **Trung bình–Cao** — đảm bảo HUD sạch trước khi phát hành |

---

## 4. Tổng hợp Token, Chi phí (Ước tính) & Hiệu quả tiết kiệm

| Phase | Input Tokens (Ước tính) | Output Tokens (Ước tính) | Chi phí ước tính (USD) | Biện pháp tiết kiệm chính |
|---|---|---|---|---|
| Phase 1 | ~65k – 85k | ~18k – 24k | ~$0.35 – $0.65 | Giữ code gọn theo module `src/sim/`, đọc theo vùng dòng |
| Phase 2 | ~110k – 140k | ~35k – 45k | ~$0.65 – $1.00 | Dùng `browser` subagent model `flash` cho QA trực quan |
| Phase 3 | ~95k – 120k | ~28k – 36k | ~$0.50 – $0.80 | Khai thác lại suite 10 kịch bản cũ + 1 lệnh `verify-all` |
| Phase 4 | ~150k – 190k | ~45k – 60k | ~$0.85 – $1.35 | Cô lập benchmark GPU qua Electron script nhỏ thay vì sửa thử mù trên repo |
| **Tổng (4 Phase)** | **~420k – 535k** | **~126k – 165k** | **~$2.35 – $3.80** | **Ước tính giảm ~30–40% lượt vòng lặp** nhờ harness tự động |

> *Ghi chú: Số liệu token/chi phí là ước tính dựa trên độ dài ngữ cảnh và các công cụ thực thi trong từng phase.*

---

## 5. Nếu làm lại hoặc bước sang dự án tiếp theo, sẽ thay đổi gì?

1. **Thiết lập cảnh benchmark tải cao (`200` thực thể) ngay từ Phase 1/2:** Nếu có cảnh đo draw calls & FPS sớm, nhóm tránh được việc thêm `UnrealBloomPass` nặng ngay từ đầu rồi mới gỡ ở Phase 4.
2. **Tạo harness quay video / screenshot chuẩn DPI ngay trong CI/QA phụ trợ:** Tự động ghép kiểm tra chồng lấn bounding-box của các phần tử HUD (như `#hud-lantern-arrow` vs `#hud-shade-arrow`) ngay trong test Playwright/Electron để không phải đợi tới mắt người nhìn ảnh mới phát hiện.
3. **Viết TDD cho mọi kịch bản CLI nền tảng Windows/Linux trước khi chốt kiến trúc:** Các khác biệt nhỏ như truyền cờ Electron qua env thay vì argv hoặc quy tắc `powershell` vs `bash` nên được chuẩn hóa vào helper dùng chung ngay từ lúc dựng skeleton.
