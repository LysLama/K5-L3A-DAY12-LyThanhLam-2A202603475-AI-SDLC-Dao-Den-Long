# CREDITS

## Nhân vật & Bối cảnh
- Nhân vật **Mây**, **Ông Đăng**, **Đảo Bến**, **Đảo Cau**, **Đảo Chuông**, **Đèn Lồng Lớn**, **Đom đóm**, **Bóng Mực**, **Bùa Gió** và **Gió Lạc** thuộc đề bài **Day 12 — AI SDLC Lab (Đảo Đèn Lồng, Phase 1–4)**.

## Hình ảnh 3D, Âm thanh & Mã nguồn
- Toàn bộ mô hình 3D (Ba hòn đảo, cầu tre, bục nhảy, tháp chuông, biển mây, Mây đội nón lá treo đèn lồng, Đèn Lồng Lớn, đom đóm, Bóng Mực, Gió Lạc) được dựng **procedural bằng hình học cơ bản trong Three.js (`0.187.0`, MIT)** với GPU `InstancedMesh` batching — không sử dụng asset 3D bên ngoài.
- Toàn bộ hiệu ứng âm thanh và nhạc nền được tổng hợp **procedural bằng Web Audio API** trong trình duyệt (`src/client/audio.ts`) — không sử dụng file âm thanh bên ngoài.

## Thư viện & Công cụ sử dụng
- **Runtime Client:**
  - `three` (`0.187.0`) — MIT License
- **Local App / Benchmark / Soak / Build & Test Tooling (`devDependencies`):**
  - `electron` (`^45.4.1`) — MIT License (dùng để chạy benchmark 1280×720 tắt VSync qua `--bench`)
  - `vite` (`8.3.8`), `vitest` (`5.1.1`), `esbuild` (`0.28.2`) — MIT License
  - `typescript` (`7.0.2`) — Apache-2.0 License
  - `@types/node` (`^22.15.0`), `@types/three` (`0.187.0`) — MIT License
  - `ffmpeg-static` (`^5.3.0`) — GPL/LGPL FFmpeg binary (chỉ dùng ngoại tuyến khi ghi video demo `docs/demo/demo.mp4`, không đóng gói vào bản phân phối game)
- **AI SDLC Harness:** AI Coding Agent hỗ trợ lập kế hoạch, sinh mã theo TDD, tự kiểm chứng và đánh giá chéo độc lập.
