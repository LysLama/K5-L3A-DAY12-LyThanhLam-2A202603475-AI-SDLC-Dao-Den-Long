# Đảo Đèn Lồng — Đêm 1: Đảo Bến

> **Demo video:** *(Sẽ đính kèm tại Release `v1.0.0` ở Phase 4)* · **Repo:** `K5-L3A-DAY12-LyThanhLam-2A202603475-AI-SDLC-Dao-Den-Long` · **Team:** `2A202603475-LyThanhLam`

Game 3D góc nhìn thứ ba: điều khiển **Mây** (người giữ đèn nhỏ tuổi đội nón lá có treo đèn lồng nhỏ) chạy trên **Đảo Bến**, thu thập đom đóm để thắp sáng **5 Đèn Lồng Lớn**, né hoặc dùng **Tỏa Sáng** xua đuổi **Bóng Mực** trong sương đen trước bình minh.

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
| `W` `A` `S` `D` | Di chuyển theo góc nhìn camera |
| `Kéo chuột trái` hoặc `←` `→` | Xoay camera 3D (`cam_yaw_deg`); cuộn chuột để zoom |
| `Space` | Nhảy |
| `E` hoặc `F` | Nạp đom đóm để thắp Đèn Lồng Lớn khi đứng trong `2.8 m` |
| `Shift`, `R` hoặc `Chuột phải` | **Tỏa Sáng** (tiêu hao `2` đom đóm, đẩy `5.0 m` & làm choáng Bóng Mực `2.5 s`) |
| `P` / `Esc` | Tạm dừng / Tiếp tục |
| `M` | Bật / Tắt âm thanh |
| `Enter` / nút **Chơi lại** | Chơi lại Đêm 1 khi kết thúc |

---

## Cách tính điểm

- **Nhặt 1 đom đóm:** `+10` điểm (`per_mote`)
- **Tỏa Sáng làm choáng 1 Bóng Mực:** `+25` điểm (`per_stun`)
- **Thắp sáng 1 Đèn Lồng Lớn** (đủ `4` đom đóm): `+150` điểm (`per_lantern`)
- **Thưởng chiến thắng (`all_lit`):** `Math.floor(time_left_s) * 5 + flames * 100` (`per_second_left`, `per_flame_left`)

Thông số chi tiết khai báo tại [`game.contract.json`](game.contract.json).

---

## Kiểm thử & Chế độ Headless (Test Contract v1.0)

```bash
# Chạy unit tests & contract tests
npm test

# Chạy toàn bộ cổng kiểm chứng (tests + scenario thắng/thua/rơi + kiểm tra tất định)
npm run verify

# Chạy chế độ headless trực tiếp
node dist-headless/cli.mjs --seed 42 --night 1 --ticks 600 --out out.jsonl --snapshot-every 10
```

---

## Sáng tạo của tôi

Các yếu tố sáng tạo được cô lập hoàn toàn trong lớp trình diễn [`src/client/`](src/client) và **không tham gia** vào [`src/sim/`](src/sim) hay [`dist-headless/cli.mjs`](src/headless/cli.mjs):

1. **Âm thanh cổ tích sinh bằng Web Audio API ([`src/client/audio.ts`](src/client/audio.ts)):** Tạo âm thanh chuông gió khi nhặt đom đóm, hợp âm ấm khi thắp Đèn Lồng, sóng cộng hưởng khi Tỏa Sáng và nhạc hiệu thắng/thua (có nút tắt `[M]`).
2. **Đảo Bến thức tỉnh, Bloom & VFX ([`src/client/sceneBuilder.ts`](src/client/sceneBuilder.ts), [`src/client/particles.ts`](src/client/particles.ts)):** Hòn đảo nổi có bến thuyền, 5 lối đá dẫn tới 5 Đèn Lồng Lớn, rừng thông stylized, trăng đêm, Bóng Mực có xúc tu và sao choáng, hiệu ứng hạt `mote_picked`/`deposit`/`lantern_lit`/`pulse`/`player_hit` kết hợp hậu kỳ `UnrealBloomPass` và bộ HUD icon SVG đồng bộ.

**Bằng chứng phần lõi không đổi:** `npm run verify` chạy `node dist-headless/cli.mjs` độc lập hoàn toàn với `src/client/`, xác minh 21/21 unit & contract test pass, kịch bản thắng/thua/rơi đảo đạt chuẩn Test Contract v1.0, và 2 lần chạy `--seed 42 --ticks 600` cho output giống hệt nhau từng byte (`92,401` bytes).

---

## Tài liệu & Bằng chứng Phase 1

- Spec & Plan: [`docs/superpowers/specs/2026-11-20-phase1-design.md`](docs/superpowers/specs/2026-11-20-phase1-design.md), [`docs/superpowers/plans/2026-11-20-phase1-island-lanterns.md`](docs/superpowers/plans/2026-11-20-phase1-island-lanterns.md)
- Giả định & tiêu chí nghiệm thu: [`docs/notes/phase-1-assumptions.md`](docs/notes/phase-1-assumptions.md)
- Nhật ký dùng AI & token: [`docs/notes/ai-log.md`](docs/notes/ai-log.md)
- Bằng chứng kiểm chứng: [`docs/proof/phase-1-proof.md`](docs/proof/phase-1-proof.md)
- AI Harness: [`AGENTS.md`](AGENTS.md), [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md), [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Nguồn & Giấy phép: [`CREDITS.md`](CREDITS.md), [`LICENSE`](LICENSE)
