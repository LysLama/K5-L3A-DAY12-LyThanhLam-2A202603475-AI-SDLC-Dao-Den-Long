# Đảo Đèn Lồng — Đèn Cạn Dầu (Phase 3)

> **Repo:** `K5-L3A-DAY12-LyThanhLam-2A202603475-AI-SDLC-Dao-Den-Long` · **Team:** `2A202603475-LyThanhLam` · **Contract:** `v1.2`

Game phiêu lưu 3D góc nhìn thứ ba: điều khiển **Mây** (người giữ đèn nhỏ tuổi đội nón lá có treo đèn lồng) vượt qua **Ba Đêm** (`Đêm 1 · Đảo Bến`, `Đêm 2 · Đảo Cau`, `Đêm 3 · Đảo Chuông`). Đèn đã thắp vẫn tiếp tục cạn dầu theo thời gian (`1.0/giây`) và bị **Bóng Mực** kéo vào hút dầu (`+5.0/giây` mỗi con) khi nhiên liệu xuống dưới `30` — nhiệm vụ không còn là thắp xong thật nhanh, mà là **giữ đủ số đèn sáng cho đến khi bình minh lên**.

---

## Cài đặt và chạy (tối đa 3 lệnh — macOS / Linux / Windows)

Yêu cầu: **Node.js ≥ 20** (đã kiểm chứng trên Node `v22.20.0`) và **npm**.

```bash
git clone https://github.com/LysLama/K5-L3A-DAY12-LyThanhLam-2A202603475-AI-SDLC-Dao-Den-Long.git && cd K5-L3A-DAY12-LyThanhLam-2A202603475-AI-SDLC-Dao-Den-Long
npm ci && npm run build
npm run start
```

Mở trình duyệt tại URL hiển thị trên terminal (mặc định `http://127.0.0.1:4173`).

---

## Điều khiển

| Phím / Chuột | Hành động |
|---|---|
| `W` `A` `S` `D` | Di chuyển (`6.0 m/s`; hoặc `7.2 m/s` khi có **Bùa Gió**) |
| `Kéo chuột trái` hoặc `←` `→` | Xoay camera 3D (`cam_yaw_deg`); cuộn chuột để zoom |
| `Space` | Nhảy (`7.0 m/s`, chỉ khi chạm đất) |
| `Shift` | **Lướt** (`14 m/s` trong `0.2 s`, hồi chiêu `1.5 s`; giữ nguyên độ cao trên không) |
| `E` hoặc `F` | Thắp đèn chưa sáng (`10` đom đóm), thắp lại đèn tắt từng sáng (`5` đom đóm), hoặc **châm dầu** đèn đang sáng (`10` dầu/đom đóm, bỏ qua đèn đầy `100`) |
| `Q`, `R` hoặc `Chuột phải` | **Tỏa Sáng** (tiêu hao `3` đom đóm, đẩy `4.0 m` & làm choáng Bóng Mực `2.0 s`, thưởng `+15` điểm nếu đang `drain`; xua/lấy lại đồ từ Gió Lạc) |
| `Esc` / `P` | Tạm dừng / Tiếp tục & **Cài đặt** (gồm Âm lượng, Độ nhạy camera, **"Bảng màu dễ phân biệt"** lưu `localStorage`) |
| `M` / `H` | Bật/Tắt âm thanh · Ẩn/Hiện thanh hướng dẫn phím |

---

## Chiến dịch Ba Đêm, Nhiên Liệu & Cách Tính Điểm (Contract v1.2)

| Đêm | Đảo | Thời lượng | Ngưỡng thắng bình minh (`ceil(0.6 × tổng)`) | Điểm nhấn |
|---|---|---|---|---|
| **Đêm 1** | **Đảo Bến** | `04:00` (`240s`) | Giữ `>= 3/5` đèn sáng | Đảo tròn `R = 40 m`, làm quen Đom đóm, châm dầu & Bóng Mực `drain` (`4.0 m/s`) |
| **Đêm 2** | **Đảo Cau** | `04:30` (`270s`) | Giữ `>= 4/6` đèn sáng | Hai đảo `R = 28 m`, **Cầu tre**, **2 Bục nhảy**, **Bùa Gió `C1`**, **Gió Lạc** |
| **Đêm 3** | **Đảo Chuông** | `05:00` (`300s`) | Giữ `>= 5/7` đèn sáng | 3 tầng (`Y = 0/3/6`), **2 Dốc**, **Tháp Chuông**, **Gió mạnh** mỗi `30s`, Bóng Mực `4.5 m/s` |

### Luật Nhiên liệu, Sức chứa & Mù màu (`Contract v1.2`)
- **Nhiên liệu đèn (`0..100`):** Khi vừa thắp đạt `100` (tính bằng đơn vị nguyên `1/60` trong `src/sim/` để không sai số số thực); hao hụt tự nhiên `1.0/giây`. Khi `fuel < 30`, đèn mất vùng an toàn `6 m` và thu hút Bóng Mực `wander` tới **`drain`** (`5.0/giây`). Đèn hết dầu (`<= 0`) tắt về trạng thái đã rách nhưng nhớ `ever_lit = true` để lần sau **thắp lại chỉ cần `5` đom đóm**.
- **Sức chứa đom đóm tăng dần:** Khởi đầu `10`, tăng `+2` sau mỗi lần Mây tự tay thắp mới hoặc thắp lại thành công (`min(20, 10 + 2 * successful_lights)`).
- **Bảng màu dễ phân biệt (Colorblind Mode):** Bật trong **Cài đặt** (`Esc`/`P` hoặc từ Menu chính), lưu `localStorage`. Mắt/hào quang Bóng Mực chuyển `#7A3CFF -> #00B3FF`, màu nguy hiểm HUD chuyển `#FF5A5F -> #FFFFFF` kèm biểu tượng `⚠`; trên 3D đèn tắt tự xẹp `20%` chiều cao với dải rách sẫm thay vì chỉ đổi màu.
- **Cách tính điểm (`v1.2`):**
  - Nạp hoặc châm `1` đom đóm: `+5` (`per_mote`)
  - Thắp mới `1` đèn: `+100` (`per_lantern`) · Thắp lại đèn đã từng sáng (`relight`): `+40` (`per_relight`)
  - Tỏa Sáng trúng Bóng Mực thường: `+5` (`per_stun`) · Trúng Bóng Mực đang `drain`: `+15` tổng (`per_stun_drain`)
  - Thắng bình minh (`dawn_survived`): `+50 + floor(fuel)` cho mỗi đèn đang sáng + `flames × 50`.

Thông số chi tiết khai báo tại [`game.contract.json`](game.contract.json) và lịch sử thay đổi tại [`CHANGELOG.md`](CHANGELOG.md).

---

## Kiểm thử & Chế độ Headless (Test Contract v1.2)

```bash
# Chạy unit tests & contract tests
npm test

# Chạy toàn bộ cổng kiểm chứng (tests + 14 kịch bản Phase 1-3 + tất định 3 Đêm + benchmark 21,600 tick)
npm run verify

# Chạy chế độ headless trực tiếp cho Đêm 1 / 2 / 3
node dist-headless/cli.mjs --seed 42 --night 3 --ticks 600 --out out.jsonl --snapshot-every 10
```

---

## Sáng tạo của tôi

Các yếu tố sáng tạo được giữ và nâng cấp hoàn toàn trong [`src/client/`](src/client) và `index.html`, **cô lập 100%** khỏi [`src/sim/`](src/sim) và [`dist-headless/cli.mjs`](dist-headless/cli.mjs):

1. **Hình khối 3D & HUD Dầu Đèn Lồng ([`src/client/sceneBuilder.ts`](src/client/sceneBuilder.ts), [`src/client/hud.ts`](src/client/hud.ts)):** Đèn tắt xẹp `20%` kèm vết rách; đèn sáng có thanh nhiên liệu 3D quay theo camera và nhấp nháy `1 Hz` khi `fuel < 30`; Bóng Mực đang `drain` cúi hướng về đèn kèm tia hút tím/xanh; HUD mở rộng tới `20` ô đom đóm theo `player.capacity` và hiển thị huy hiệu `⚠ Dầu yếu` kèm đếm đèn đạt ngưỡng bình minh.
2. **Âm thanh Web Audio & Cốt truyện Ông Đăng ([`src/client/audio.ts`](src/client/audio.ts), [`src/client/hud.ts`](src/client/hud.ts)):** Bổ sung âm thanh châm dầu (`refuel`), tắt đèn (`lantern_out`) và hút dầu (`fuel_drain`) cùng phần dẫn truyện Ba Đêm (`04:00 / 04:30 / 05:00`) và nút chuyển **Bảng màu dễ phân biệt**.

**Bằng chứng phần lõi không đổi:** `npm run verify` chạy trực tiếp trên [`dist-headless/cli.mjs`](dist-headless/cli.mjs), xác minh **7/7 file (29/29 test)** Vitest pass, **14/14 kịch bản** Phase 1–3 (`win-all-lit`, `loss-*`, `fall-edge`, `dash`, `charm`, `drifter`, `night2-bridge-jump`, `night3-tiers-wind`, `pause-resume`, `fuel-refuel-relight`, `shade-drain-pulse`, `dawn-survived-threshold`, `capacity-scaling`) pass chuẩn `v1.2`, tất định 100% ở cả 3 Đêm và benchmark `21,600` tick Đêm 3 đạt `2369 ms` (`<= 30,000 ms`).

---

## Tài liệu & Bằng chứng

- Spec & ADR: [`2026-11-20-phase3-design.md`](docs/superpowers/specs/2026-11-20-phase3-design.md) (`ADR-001`), [`2026-11-20-phase2-design.md`](docs/superpowers/specs/2026-11-20-phase2-design.md), [`2026-11-20-phase1-design.md`](docs/superpowers/specs/2026-11-20-phase1-design.md)
- Changelog & Giả định: [`CHANGELOG.md`](CHANGELOG.md), [`phase-3-assumptions.md`](docs/notes/phase-3-assumptions.md), [`phase-2-assumptions.md`](docs/notes/phase-2-assumptions.md)
- Nhật ký AI & Token: [`ai-log.md`](docs/notes/ai-log.md)
- Bằng chứng kiểm chứng: [`phase-3-proof.md`](docs/proof/phase-3-proof.md), [`phase-2-proof.md`](docs/proof/phase-2-proof.md), [`phase-1-proof.md`](docs/proof/phase-1-proof.md)
- AI Harness: [`AGENTS.md`](AGENTS.md), [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md)
