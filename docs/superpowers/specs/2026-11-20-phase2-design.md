# Phase 2 Design Spec — TICKET-02: Ba hòn đảo (Contract v1.1)

- **Ngày:** 2026-11-20
- **Tag mục tiêu:** `phase-2`
- **Contract:** `v1.1`
- **Mục tiêu:** Chuẩn hóa toàn bộ thông số & luật chơi theo TICKET-02 Phần 1, mở rộng 3 Đêm (`Đảo Bến`, `Đảo Cau`, `Đảo Chuông`), bổ sung Lướt (`dash`), Gió Lạc (`drifters`), Bùa Gió (`charms`), Gió mạnh (`wind`), Tạm dừng (`pause`), chuỗi 3 Đêm + Menu/Cài đặt/Âm thanh/HUD đầy đủ và nâng cấp Test Contract lên `v1.1`.

---

## 1. Số liệu chuẩn & `game.contract.json` (`1.1`)

```json
{
  "contract_version": "1.1",
  "team": "2A202603475-LyThanhLam",
  "build_cmd": "npm ci && npm run build",
  "run_cmd": "npm run start",
  "headless_cmd": "node dist-headless/cli.mjs",
  "tuning": {
    "player_speed": 6.0,
    "dash_speed": 14.0,
    "dash_duration_s": 0.2,
    "dash_cooldown_s": 1.5,
    "carry_capacity": 10,
    "lantern_cost": 10,
    "lantern_count_night1": 5,
    "pickup_radius": 1.0,
    "interact_radius": 2.0,
    "pulse_cost": 3,
    "pulse_radius": 5.0,
    "night1_duration_s": 300,
    "night2_duration_s": 330,
    "night3_duration_s": 360,
    "flames": 3,
    "invuln_s": 1.5,
    "hit_drop_ratio": 0.5,
    "pulse_stun_s": 2.0,
    "pulse_push_m": 4.0,
    "pulse_cooldown_s": 3.0,
    "safe_radius": 6.0,
    "shade_speed": 4.0,
    "shade_hit_radius": 1.0,
    "fall_enabled": true,
    "score": {
      "per_mote": 10,
      "per_lantern": 100,
      "per_stun": 5,
      "per_second_left": 2,
      "per_flame_left": 50
    }
  }
}
```
- `score.per_mote = 10` cộng khi **nạp vào đèn** (`deposit`, `+10` mỗi đom đóm nạp, không cộng lúc nhặt).
- Đêm 3 sử dụng tốc độ Bóng Mực `4.5 m/s` (`SHADE_SPEED_NIGHT3 = 4.5`), các hằng số cố định khác: `JUMP_VELOCITY = 7.0`, `GRAVITY = -20.0`, `FALL_VOID_Y = -10.0`, `CHARM_SPEED = 7.2`, `CHARM_TICKS = 600`, `CHARM_RESPAWN_TICKS = 2700`, `DRIFTER_IDLE_SPEED = 2.0`, `DRIFTER_FAST_SPEED = 7.0`.

---

## 2. Thứ tự xử lý 12 bước trong 1 tick (`stepTick`)

1. **Input & Pause:** Đọc input. Kiểm tra sườn lên `pause` (`false -> true`): đổi trạng thái `paused <-> playing`, phát event `paused {}` / `resumed {}`. Nếu vừa chuyển sang `paused` hoặc đang ở trạng thái `paused`, tăng `state.tick += 1` và **dừng bước ngay** (`sim_tick`, thời gian, cooldown, spawn, TTL đứng yên).
2. **Giảm bộ đếm:** `sim_tick += 1`, `time_left_s`, `invuln_ticks`, `dash_cd_ticks`, `pulse_cd_ticks`, `charm_ticks`, `fall_wait_ticks`, `shade.state_ticks_left`, `shade.push_ticks_left`, `shade.safe_push_ticks_left`, `drifter.state_ticks_left`, `charm.respawn_ticks`, `wind` timers, và xóa đom đóm `dropped` hết `ttl_ticks <= 0`.
3. **Di chuyển Mây & Rơi khỏi đảo:**
   - Nếu `fall_wait_ticks > 0`: không di chuyển, không nhặt, không bị chạm; khi `fall_wait_ticks` về `0`, hồi sinh tại điểm xuất phát Đêm (`vel = [0,0,0]`, `invuln_ticks = 90`).
   - Ngược lại: xử lý `dash` (12 tick, `14 m/s`, giữ nguyên Y, bỏ qua cooldown khi `charm_ticks > 0`), `jump` (chỉ khi `grounded`), di chuyển tăng tốc/dừng trong `0.075–0.09 s` (`<= 0.1 s`, gia tốc `80 m/s²`), giữ vận tốc bục nhảy `launched` tới khi chạm đất (trừ khi `dash`), cộng gió mạnh (`2 m/s` khi `wind.active`), va chạm Tháp chuông Đêm 3 (`r >= 2 m`) & mép vách đứng Đêm 3, chạm bục nhảy (`r <= 1 m`), và kiểm tra rơi `Y < -10` (mất 1 Ngọn Lửa bất chấp `invuln`, `lost = carried`, `carried = 0`, emit `player_hit {by:"fall", flames, dropped:0, lost}`, nếu còn Ngọn Lửa đặt `fall_wait_ticks = 60`).
4. **Nhặt đom đóm & Bùa Gió:** `XZ <= 1.0 m && |dy| <= 1.5 m`, đom đóm `dropped` chỉ nhặt từ tick sau khi tạo (`createdTick < simTick`). Nhặt Bùa Gió làm mới `charm_ticks = 600`, reset `dash_cd_ticks = 0`, đặt `respawn_ticks = 2700`, emit `charm_picked`.
5. **Tương tác đèn (`interact`):** Gần nhất trong `2.0 m` XZ (`!lit`, tie-break `id`), nạp `min(carried, 10 - deposited)`, cộng `+10 * amount`, thắp đèn cộng `+100` và kích hoạt `safe_push_ticks_left = 30` cho Bóng Mực đang ở trong vùng `6 m`.
6. **Cập nhật vùng an toàn (`6 m`):** Bóng đang có `safe_push_ticks_left > 0` được đẩy dần ra mép `6 m`; Bóng ngoài vùng bị chặn ở mép `6 m`.
7. **Tỏa Sáng (`pulse`):** Cần `carried >= 3` và `pulse_cd_ticks === 0`. Tâm = `[pos[0], pos[1]+0.8, pos[2]]`, quét khoảng cách 3D `<= 5.0 m`:
   - Bóng Mực: đặt/làm mới `stunned` `120` tick + đẩy lùi `4.0 m` trong `15` tick đầu (trùng tâm đẩy theo `+X`, dừng nếu gặp vật cản), `+5` điểm mỗi con mỗi lần.
   - Gió Lạc: đang `chase`/`idle` → `flee` không cướp (`120` tick); đang `flee` có `stolen > 0` → thả đom đóm rơi tại chỗ (`ttl = 480`), `drifter_drop`, chuyển `flee` `120` tick.
8. **Di chuyển Bóng Mực & Gió Lạc:**
   - Bóng Mực (`spawning` → `wander` sau 30 tick; `wander` 2 m/s ↔ `chase` tại 12/18 m; `recoil` lùi 2 m trong 60 tick; `stunned` trượt lùi 15 tick đầu).
   - Gió Lạc (`idle` 2 m/s ↔ `chase` 7 m/s khi `carried >= 5 && XZ <= 15 m`; `flee` bay xa 7 m/s hết `state_ticks_left` thì `removed`).
9. **Va chạm (theo thứ tự bắt buộc):** Gió Lạc cướp trước (`XZ <= 1.2 m`, `min(3, carried)`, bất kể `invuln` & vùng an toàn, emit `drifter_steal`, `flee` 240 tick) → Bóng Mực gây hit (`XZ <= 1.0 m && |dy| <= 1.5 m`, trừ `spawning`/`stunned`/`recoil`/`safe_push`/`invuln`/`fall_wait`, rơi `floor(carried/2)` ra vành `1.5–2.5 m`, `invuln = 90`, shade → `recoil` 60 tick).
10. **Sinh thực thể theo lịch:** Đom đóm tại `240, 480...` (nếu `< 30` trên điểm trống); Bóng Mực tại `300`, sau đó mỗi `480` (Đ1) / `420` (Đ2) / `360` (Đ3) tick tại điểm hợp lệ cách Mây `>= 15 m`; Gió Lạc tại `1200, 2400...` (Đêm 2–3, tối đa 2 con).
11. **Xét thắng/thua:** Hết Ngọn Lửa → `lost (no_flames)`; còn sống & mọi đèn sáng → `won (all_lit)` (+ `floor(time_left_s)*2 + flames*50`); hết giờ → `lost (dawn)`.
12. **Snapshot v1.1:** Ghi theo `--snapshot-every`.

---

## 3. Acceptance Criteria cho từng mục Phần 3 (TICKET-02 DoD)

- **AC-P2-1 (Số liệu chuẩn & Regression Phase 1):** `game.contract.json` (`1.1`) khớp chính xác mọi số liệu Phần 1; mọi test cơ chế Phase 1 đạt chuẩn v1.1.
- **AC-P2-2 (Lướt / Dash):** Kích hoạt `14 m/s` trong `0.2 s` (`12` tick), hồi chiêu `1.5 s` từ lúc bắt đầu, giữ nguyên Y trên không, không bất tử, phát event `dash`.
- **AC-P2-3 (Đêm 2 — Đảo Cau):** 2 đảo `R=28` tại `(0,0,0)` & `(70,0,0)`, cầu tre `[26..44]×[-2..2]`, 2 bục nhảy `(20,0,18)` & `(50,0,-18)` bắn `vy=14, vh=24` giữ tới chạm đất, 6 đèn, Bùa Gió `(35,0,0)`.
- **AC-P2-4 (Đêm 3 — Đảo Chuông):** Đảo `R=45`, 3 tầng `Y=0, 3, 6`, vách đứng không trèo được, 2 dốc `30°/150°`, bục nhảy `(0,3,13)` đáp tầng 2, Tháp chuông `R=2, H=8` chặn va chạm, 7 đèn, Gió mạnh mỗi `30s` kéo dài `5s` (`2 m/s`, báo trước `2s`), 2 Bùa Gió.
- **AC-P2-5 (Gió Lạc — Drifters):** Tối đa `2` con Đêm 2–3, `idle <-> chase` (`>=5` đom đóm & `<=15m`), chạm cướp `min(3, carried)` bỏ qua bất tử/safe zone, Tỏa Sáng đánh rơi lại toàn bộ đồ đã cướp (`drifter_drop`).
- **AC-P2-6 (Bùa Gió):** Hiệu lực `600` tick (`7.2 m/s` + Lướt 0 hồi chiêu), làm mới khi nhặt lại, hồi sinh sau `2700` tick (`charm_picked`).
- **AC-P2-7 (Chuỗi 3 Đêm, Menu, Pause, Cài đặt, Âm thanh, HUD & Màu chuẩn):** Menu chính → Intro (Ông Đăng) → Đêm 1/2/3 → Bình Minh (tổng điểm); Pause `Esc/P` đóng băng sim + cho Restart/Settings/Menu; lưu âm lượng & độ nhạy chuột (`localStorage`); âm thanh đủ 10+ sự kiện; HUD có đồng hồ nhấp nháy đỏ `<=30s`, thanh 10 ô, hồi chiêu Lướt & Tỏa Sáng, mũi tên chỉ đèn ngoài màn hình; bảng màu khớp ±10% RGB và ánh sáng `0.15 + 0.55*(lit/total)`; `≥ 30 FPS` tại `1280×720` và headless `21,600` tick `≤ 30s`.
