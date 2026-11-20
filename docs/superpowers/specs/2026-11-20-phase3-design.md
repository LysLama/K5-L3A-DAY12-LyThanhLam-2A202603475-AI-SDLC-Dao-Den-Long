# Phase 3 Design Spec & ADR-001 — TICKET-03: "Đèn cạn dầu" (Contract v1.2)

- **Ngày:** 2026-11-20
- **Tag mục tiêu:** `phase-3`
- **Contract:** `v1.2`
- **Mục tiêu:** Thay đổi luật thắng từ "thắp đủ là thắng" sang **giữ đảo đủ sáng cho đến bình minh** (`dawn_survived`), bổ sung cơ chế **nhiên liệu đèn (`0..100`)**, Bóng Mực trạng thái **`drain`** hút dầu đèn yếu (`fuel < 30`), **sức chứa tăng dần** (`10..20`), **bảng điểm v1.2**, và **chế độ mù màu** (`Bảng màu dễ phân biệt`).

---

## 1. Kiến trúc Quyết định (ADR-001)

### Bối cảnh & Vấn đề
Ở Contract `v1.0`/`v1.1`, trạng thái đèn chỉ gồm `lit: boolean` và `deposited: number`, và trò chơi kết thúc ngay khi mọi đèn đều sáng (`all_lit`). TICKET-03 biến đèn thành tài nguyên động liên tục giảm (`1.0/s` tự nhiên + `5.0/s` mỗi Bóng Mực `drain`), có thể tắt (`lantern_out`), tái thắp rẻ hơn (`5` đom đóm thay vì `10`), và chỉ thắng tại bình minh nếu giữ được `>= ceil(0.6 × tổng đèn)`.

### Phương án đã chọn vs Các phương án khác
- **Biểu diễn dầu bằng số nguyên đơn vị `1/60` (`fuelTicks: 0..6000`) trong `LanternState`:**
  - *Đã chọn:* Mỗi tick trừ `1` (tự nhiên) `+ 5 × số Bóng đang drain`; châm dầu `used = min(carried, ceil((6000 - fuelTicks) / 600))`; xuất snapshot làm tròn `Math.round((fuelTicks / 60) * 10) / 10`.
  - *Vì sao loại phương án trừ float `- 1/60`:* Tích lũy `float` qua `18,000` ticks gây trôi `29.999999998` vs `30.0` (sai lệch biên mất vùng an toàn hoặc tick hết dầu không tất định giữa máy).
- **Máy trạng thái Đèn (`LanternState`) & Hồi chiêu Châm dầu:**
  - Chưa từng sáng (`lit=false, everLit=false`): cần `10` đom đóm; thắp sáng đặt `lit=true, fuelTicks=6000, everLit=true, successfulLights+=1`.
  - Đã tắt sau khi từng sáng (`lit=false, everLit=true`): cần `5` đom đóm (`relight_cost`); thắp lại đặt `relitCount+=1, relight: true`, cộng `+40` (thay vì `+100`).
  - Đang sáng chưa đầy (`lit=true, fuelTicks < 6000`): châm dầu `10 fuel/mote`; nếu vượt từ `< 1800` (`<30`) lên `>= 1800` (`>=30`) kích hoạt đẩy Bóng Mực trong vùng `6 m` (`safePushTicksLeft = 30`). Đèn đang đầy dầu (`round1(fuelTicks / 60) >= 100`, bao gồm tick ngay sau `-1/60` tự nhiên từ `100.0`) có `used = 0` và bị bỏ qua khi chọn đèn tương tác gần nhất.
- **Máy trạng thái Bóng Mực (`drain` + ưu tiên `wander`):**
  - `wander`: ưu tiên đèn sáng có `fuel < 30` gần nhất (tie-break `id` nhỏ hơn) → đèn tắt gần nhất → chỉ lang thang ngẫu nhiên khi toàn bộ đèn đang sáng `>= 30`.
  - `wander -> drain` khi cách đèn sáng yếu `<= 2 m` (XZ); `drain -> chase` khi Mây vào `6 m`; `drain -> stunned` khi trúng Tỏa Sáng (tổng `+15` điểm); `drain -> wander` nếu đèn tắt (`!lit`), được châm lên `>= 30`, hoặc cách `> 2 m`.
  - Bóng Mực đang ở `stunned` hết thời gian trở về `wander`.
- **Chiến lược cập nhật Test cũ (DoD):**
  - Toàn bộ unit/contract/scenario test trước đây giả định `all_lit` thắng sớm, điểm cũ (`+10/mote`, thời gian còn lại), hoặc thời lượng `300/330/360s` được nâng cấp tường minh sang `v1.2` (không skip test); mọi test Phase 1–2 không bị thay luật (Dash, Bùa Gió, Gió Lạc, Đảo Cau/Chuông, Gió mạnh, Pause, Fall `< -10`) giữ nguyên và tiếp tục chạy đạt.

---

## 2. Cấu trúc Dữ liệu & Contract `v1.2`

- **`game.contract.json` (`contract_version: "1.2"`):**
  - Thời lượng mới: `night1_duration_s: 240`, `night2_duration_s: 270`, `night3_duration_s: 300`.
  - Thêm: `fuel_max: 100`, `fuel_decay_per_s: 1.0`, `fuel_per_mote: 10`, `relight_cost: 5`, `win_ratio: 0.6`, `drain_per_s: 5`, `low_fuel_threshold: 30`, `capacity_max: 20`.
  - Bảng điểm mới: `per_mote: 5`, `per_lantern: 100`, `per_relight: 40`, `per_stun: 5`, `per_stun_drain: 15`, `per_lantern_dawn: 50`, `per_flame_left: 50` (xóa `per_second_left`).
- **Snapshot:** `player.capacity`, `lanterns[].{fuel, ever_lit, relit_count}`, `shades[].state` hỗ trợ thêm `'drain'`.
- **Scenario:** `player.successful_lights`, `lanterns[].{lit, fuel, ever_lit}`, `shades[].target_lantern_id`.
- **Events:** `refuel {lantern_id, amount, fuel}`, `lantern_out {lantern_id}`, `fuel_drain {lantern_id, shade_id, fuel}` (mỗi `60` tick đang hút), `lantern_lit {lantern_id, relight}`, `game_over.reason ∈ ['dawn_survived', 'dawn', 'no_flames']`.

---

## 3. Giao diện, Bảng màu Mù màu & Hiệu ứng (`src/client/`)

- **Trên Đèn Lồng 3D:**
  - Đèn tắt (`!lit`): xẹp `20%` chiều cao phần lồng giấy (`scale.set(1, 0.8, 1)`), hiển thị dải giấy rách màu sẫm trên lồng giúp phân biệt bằng hình khối không cần màu.
  - Đèn sáng (`lit`): thanh dầu 3D nổi phía trên mái đèn (chiều dài `0..100%`), khi `fuel < 30` cả ngọn lửa đèn lẫn thanh dầu nhấp nháy chậm chu kỳ `1 Hz`.
- **HUD:** Hiển thị `carried / capacity` trên thanh đom đóm mở rộng tối đa `20` ô (theo `player.capacity`), hiển thị số đèn sáng hiện tại kèm ngưỡng thắng (`k/n · cần m`), Bóng Mực `drain` cúi hút ánh sáng đèn bằng luồng tối.
- **Cài đặt "Bảng màu dễ phân biệt" (`colorblindMode`, lưu `localStorage`):**
  - Mắt & hào quang Bóng Mực chuyển `#7A3CFF` → `#00B3FF`.
  - Màu cảnh báo HUD (`timer <= 30s`, `Ngọn Lửa`, cảnh báo `Gió mạnh`, nút danger) chuyển `#FF5A5F` → `#FFFFFF` và luôn kèm ký hiệu `⚠`.
