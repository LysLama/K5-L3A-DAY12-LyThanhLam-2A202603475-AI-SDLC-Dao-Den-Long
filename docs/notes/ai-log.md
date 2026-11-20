# Nhật ký Dùng AI & Đánh giá Phase 1

## 1. Quy trình làm việc với AI
1. **Brainstorming & Spec:** Phân tích PRD-0 + Test Contract v1.0, kiểm tra môi trường (`Node v22.20.0`, `Three.js 0.187.0`, `Vite 8.3.8`, `Vitest 5.1.1`), rà soát spec bằng subagent độc lập trước khi viết code.
2. **Planning & TDD:** Lập kế hoạch 6 task nhỏ trong `docs/superpowers/plans/2026-11-20-phase1-island-lanterns.md`. Với mỗi module logic (`world.ts`, `step.ts`, `runner.ts`/`validate.ts`, `inputMapper.ts`), viết test thất bại trước (RED) rồi mới viết code tối thiểu cho pass (GREEN).
3. **Verify & Independent Review:** Chạy `npm run build && npm run verify`, kiểm tra game 3D trên trình duyệt thật và chạy subagent reviewer độc lập cuối nhánh.

## 2. Các lỗi AI gặp phải & Cách phát hiện / Chỉnh Harness
| Tình huống | Lỗi phát sinh | Cách phát hiện | Cách khắc phục & Cập nhật Harness |
|---|---|---|---|
| Camera vs WASD trong Three.js | Trong kế hoạch ban đầu ghi nhầm `D -> move: [1, 0]` trong khi camera Y-up nhìn dọc `+Z` có vector phải màn hình là `forward × up = (-1, 0, 0)` | Kiểm tra tích có hướng khi thiết kế `inputMapper.ts` và khóa bằng test parity `rx === -fz` | Sửa `D -> [-1, 0]`, `A -> [1, 0]`, thêm test kiểm tra góc `45°` trong `tests/unit/clientInput.test.ts` |
| TypeScript 7 (`tsc --noEmit`) & CSS import | `import './style.css'` lỗi `TS2882` do chưa khai báo `vite/client` types | Chạy `npm run build` | Thêm `src/vite-env.d.ts` (`/// <reference types="vite/client" />`) |
| Test kịch bản đứng yên `1600` ticks | Giả định không đúng rằng nhân vật đứng yên sống qua `1500` ticks để thấy `shade_spawned` — thực tế 3 Bóng Mực chạm giết ở tick `543` | Chạy thật `vitest run` trên binary headless | Tách riêng kiểm tra tất định 600 ticks và scenario có đèn `lit: true` tại `(0,0,0)` cho `shade_spawned` tại tick `1500` |
| Shell trên Windows | PowerShell 5.1 không hỗ trợ `&&` giữa các lệnh | Chạy lệnh kiểm thử bị parser báo lỗi | Dùng `; if ($LASTEXITCODE -eq 0)` khi chạy local và giữ `&&` chuẩn POSIX trong `game.contract.json` cho macOS/Linux |

## 3. Quản lý Token & Ước tính Chi phí Phase 1
- **Ước tính token Phase 1:** ~65k–85k input tokens (kèm context đọc file + log) và ~18k–24k output tokens (~`\$0.35–\$0.65` quy đổi API tùy gói).
- **Cách đã tiết kiệm token:**
  - Chọn thực thi **Native inline** trong 1 phiên kèm sổ tiến độ gọn (`.superpowers/sdd/.../progress.md`) thay vì spawn subagent implement/review cho từng task riêng lẻ (tránh đọc lại codebase 6×2 lần).
  - Giữ `AGENTS.md` dưới 30 dòng; chỉ tạo 1 skill `.agents/skills/verify-phase/SKILL.md` ngắn gọn.
  - Chốt bản thiết kế spec trước khi code để không phải viết lại kiến trúc giữa chừng.
