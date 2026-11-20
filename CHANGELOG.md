# CHANGELOG — Breaking Changes & Upgrades

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
