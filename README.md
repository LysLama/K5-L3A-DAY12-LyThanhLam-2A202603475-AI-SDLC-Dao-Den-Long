# Đảo Đèn Lồng — Ba Hòn Đảo (Phase 2)

> **Repo:** `K5-L3A-DAY12-LyThanhLam-2A202603475-AI-SDLC-Dao-Den-Long` · **Team:** `2A202603475-LyThanhLam` · **Contract:** `v1.1`

Game phiêu lưu 3D góc nhìn thứ ba: điều khiển **Mây** (người giữ đèn nhỏ tuổi đội nón lá có treo đèn lồng) vượt qua **Ba Đêm** (`Đêm 1 · Đảo Bến`, `Đêm 2 · Đảo Cau`, `Đêm 3 · Đảo Chuông`), thu thập đom đóm, thắp sáng các **Đèn Lồng Lớn**, né **Bóng Mực**, giành lại ánh sáng từ **Gió Lạc** và giữ vững ngọn lửa trước bình minh.

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
| `E` hoặc `F` | Nạp đom đóm để thắp Đèn Lồng Lớn gần nhất trong `2.0 m` (`10` đom đóm/đèn) |
| `Q`, `R` hoặc `Chuột phải` | **Tỏa Sáng** (tiêu hao `3` đom đóm, đẩy `4.0 m` & làm choáng Bóng Mực `2.0 s`; xua/lấy lại đồ từ Gió Lạc) |
| `Esc` / `P` | Tạm dừng / Tiếp tục (đóng băng hoàn toàn simulation) |
| `M` / `H` | Bật/Tắt âm thanh · Ẩn/Hiện thanh hướng dẫn phím |

---

## Chiến dịch Ba Đêm & Cách tính điểm (Contract v1.1)

| Đêm | Đảo | Thời gian | Đèn Lồng | Điểm nhấn |
|---|---|---|---|---|
| **Đêm 1** | **Đảo Bến** | `05:00` (`300s`) | `5` đèn | Đảo tròn `R = 40 m`, làm quen Đom đóm & Bóng Mực (`4.0 m/s`) |
| **Đêm 2** | **Đảo Cau** | `05:30` (`330s`) | `6` đèn | Hai đảo `R = 28 m`, **Cầu tre**, **2 Bục nhảy**, **Bùa Gió `C1`**, **Gió Lạc** |
| **Đêm 3** | **Đảo Chuông** | `06:00` (`360s`) | `7` đèn | 3 tầng (`Y = 0/3/6`), **2 Dốc**, **Tháp Chuông** đỉnh đảo, **Gió mạnh** mỗi `30s`, Bóng Mực `4.5 m/s` |

- **Nạp 1 đom đóm vào đèn:** `+10` điểm (`per_mote`)
- **Thắp sáng 1 Đèn Lồng Lớn** (đủ `10` đom đóm): `+100` điểm (`per_lantern`)
- **Tỏa Sáng trúng 1 Bóng Mực:** `+5` điểm (`per_stun`, cộng mỗi lần trúng kể cả đang choáng)
- **Thưởng chiến thắng (`all_lit`):** `Math.floor(time_left_s) * 2 + flames * 50` (`per_second_left`, `per_flame_left`)

Thông số chi tiết khai báo tại [`game.contract.json`](game.contract.json).

---

## Kiểm thử & Chế độ Headless (Test Contract v1.1)

```bash
# Chạy unit tests & contract tests
npm test

# Chạy toàn bộ cổng kiểm chứng (tests + 10 kịch bản Phase 1-2 + tất định 3 Đêm + benchmark 21,600 tick)
npm run verify

# Chạy chế độ headless trực tiếp cho Đêm 1 / 2 / 3
node dist-headless/cli.mjs --seed 42 --night 3 --ticks 600 --out out.jsonl --snapshot-every 10
```

---

## Sáng tạo của tôi

Các yếu tố sáng tạo tiếp tục được cô lập 100% trong [`src/client/`](src/client) và `index.html`, **không tham gia** vào [`src/sim/`](src/sim) hay [`dist-headless/cli.mjs`](src/headless/cli.mjs):

1. **Chuỗi truyện Ông Đăng & Trải nghiệm 3 Đêm ([`src/client/hud.ts`](src/client/hud.ts)):** Màn hình Intro từng Đêm với lời dẫn của Ông Đăng, cảnh báo Gió mạnh kèm chuông báo, thanh năng lượng 10 ô, mũi tên chỉ đèn lồng ngoài khung hình và màn hình Bình Minh tổng kết điểm chiến dịch.
2. **Âm thanh Web Audio (`Soundscape`) & Cảnh quan 3D ([`src/client/audio.ts`](src/client/audio.ts), [`src/client/sceneBuilder.ts`](src/client/sceneBuilder.ts)):** Nhạc nền pentatonic êm dịu cùng hơn 14 hiệu ứng (`dash`, `charm_picked`, `drifter_steal`, `drifter_drop`, `shade_spawned`, cảnh báo gió, đếm ngược 10 giây cuối), hàng cây cau trên Đảo Cau, quả chuông đồng trên Tháp Chuông Đảo Chuông rung theo cơn gió và vệt lá gió `VfxManager`.

**Bằng chứng phần lõi không đổi:** `npm run verify` chạy độc lập trên [`dist-headless/cli.mjs`](dist-headless/cli.mjs), xác minh **23/23** unit & contract test pass, toàn bộ kịch bản Phase 1 & Phase 2 pass chuẩn `v1.1`, kiểm tra tất định 100% trên cả 3 Đêm và benchmark `21,600` tick Đêm 3 đạt `382 ms` (`<= 30,000 ms`).

---

## Tài liệu & Bằng chứng

- Spec: [`2026-11-20-phase1-design.md`](docs/superpowers/specs/2026-11-20-phase1-design.md), [`2026-11-20-phase2-design.md`](docs/superpowers/specs/2026-11-20-phase2-design.md)
- Giả định & tiêu chí: [`phase-1-assumptions.md`](docs/notes/phase-1-assumptions.md), [`phase-2-assumptions.md`](docs/notes/phase-2-assumptions.md)
- Nhật ký AI & Token: [`ai-log.md`](docs/notes/ai-log.md)
- Bằng chứng kiểm chứng: [`phase-1-proof.md`](docs/proof/phase-1-proof.md), [`phase-2-proof.md`](docs/proof/phase-2-proof.md)
- AI Harness: [`AGENTS.md`](AGENTS.md), [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md)
