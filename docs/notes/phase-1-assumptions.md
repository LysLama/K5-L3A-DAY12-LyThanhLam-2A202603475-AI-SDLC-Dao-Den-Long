# Giả định & Tiêu chí Nghiệm thu — Phase 1 (PRD-0)

## 1. Giả định cho các điểm mơ hồ trong PRD-0

| Điểm mơ hồ | Giả định đã chốt | Lý do |
|---|---|---|
| Kích thước Đảo Bến & vị trí 5 Đèn Lồng | Đảo tròn bán kính `36.0 m`, mặt đất `Y = 0`; 5 Đèn Lồng (`L1..L5`) cách đều góc `72°` trên vòng tròn bán kính `22.0 m` | Khớp quy mô ví dụ `L1: [0,0,25]` trong Test Contract D và đủ rộng cho di chuyển/rượt đuổi |
| Khả năng mang & chi phí thắp đèn | `carry_capacity = 10`, `lantern_cost = 4`, `player_speed = 7.0 m/s`, `night1_duration_s = 240 s` | Cho phép gom đủ đom đóm cho 2 đèn mỗi chuyến, đủ thời gian hoàn thành trong 4 phút |
| Số đom đóm & Bóng Mực mặc định | Ban đầu `28` đom đóm (`M1..M28`, respawn mỗi `5s` nếu thiếu ngân sách `< 35`), `3` Bóng Mực (`S1..S3` ở rìa `26..32m`, spawn thêm mỗi `25s` tối đa `6` con) | Đảm bảo không bị thiếu đom đóm (soft-lock) kể cả khi dùng Pulse hoặc bị rơi đồ |
| Cơ chế Tỏa Sáng (`pulse`) | `pulse_cost = 2`, `pulse_radius = 7.5 m`, `pulse_push_m = 5.0 m`, `pulse_stun_s = 2.5 s`, `pulse_cooldown_s = 3.0 s`; thực thi **trước** va chạm Bóng Mực trong cùng tick | Hồi chiêu `3.0s > 2.5s` tránh choáng chồng; chạy trước va chạm giúp người chơi phản xạ cứu nguy kịp thời |
| Rơi khỏi đảo & làm rơi đom đóm | `fall_enabled = true`: rơi xuống `Y <= -4.0` trừ `1` flame, hồi sinh `(0,0,0)` với `invuln_s = 1.5 s`. Số đom đóm rơi = `Math.floor(carried * 0.5)` (bị trừ khỏi `carried`) | Không cộng/spawn lại dưới chân để tránh tự nhặt lại ngay tick kế tiếp; `Math.floor` giữ số nguyên |
| Vùng an toàn `safe_radius = 5.5 m` | Đèn đã thắp đẩy Bóng Mực ra `>= 5.5 m` (chạy 3 lượt giải quyết đèn chồng vùng) + trượt tiếp tuyến tất định (`cross === 0` chọn `+1` CCW) | Tránh Bóng Mực kẹt cứng sau cột đèn nhưng vẫn không xâm phạm vùng an toàn |
| Ưu tiên khi kết thúc cùng tick | Kiểm tra `all_lit` (`won`) ở bước `interact` trước `dawn` (`time_left_s <= 0`) | Đáp ứng kỳ vọng công bằng khi người chơi thắp đèn cuối ở khoảnh khắc cuối cùng |

## 2. Tiêu chí Nghiệm thu Chính

1. **AC-1 (Điều khiển & thế giới 3D):** Mây đội nón lá treo đèn nhỏ di chuyển/nhảy/xoay camera mượt trên Đảo Bến; hiển thị đủ 5 Đèn Lồng, đom đóm, Bóng Mực, HUD, nút Tạm dừng & Chơi lại.
2. **AC-2 (Test Contract v1.0 Headless):** `node dist-headless/cli.mjs` chạy 60Hz cố định, đọc `--scenario` & `--inputs`, thoát mã `2` nếu sai định dạng, xuất JSONL đúng chuẩn và giống hệt nhau khi cùng `--seed`.
3. **AC-3 (Thắng / Thua / Hồi sinh):** Thắp đủ 5 đèn → `won (all_lit)`; mất 3 flame → `lost (no_flames)`; hết giờ → `lost (dawn)`; rơi khỏi đảo → `player_hit (fall)`.
4. **AC-4 (Sáng tạo không phá lõi):** Âm thanh Web Audio và hiệu ứng ánh sáng đảo tách hoàn toàn ở `src/client/`, không đổi đầu ra `dist-headless/cli.mjs`.
