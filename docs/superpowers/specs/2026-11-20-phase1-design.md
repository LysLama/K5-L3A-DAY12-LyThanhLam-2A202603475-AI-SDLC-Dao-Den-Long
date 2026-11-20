# Phase 1 Design Spec — Đảo Đèn Lồng (Đêm 1: Đảo Bến)

- **Ngày:** 2026-11-20
- **Repository:** `https://github.com/LysLama/K5-L3A-DAY12-LyThanhLam-2A202603475-AI-SDLC-Dao-Den-Long`
- **Team ID (`game.contract.json`):** `2A202603475-LyThanhLam`
- **Mục tiêu Phase 1:** Hoàn thành game 3D playable **Đảo Đèn Lồng (Đêm 1 – Đảo Bến)** tuân thủ đầy đủ **PRD-0** và **Test Contract v1.0**, kèm AI harness, kiểm chứng tự động và bằng chứng khớp tag `phase-1`.

---

## 1. Approaches Considered & Chosen Stack

| Phương án | Mô tả | Đánh đổi | Quyết định |
|---|---|---|---|
| **A. TypeScript + Three.js (Vite) + Node.js Headless (esbuild)** | Lõi simulation thuần TS không phụ thuộc DOM/WebGL; compile thành `dist/` cho trình duyệt và `dist-headless/cli.mjs` cho Node.js 22+ | Cần Node/npm trên máy chấm và mở browser qua `vite preview`; đổi lại chạy cực nhanh, tất định 100%, không lỗi GPU/Apple Silicon | **Chọn** |
| **B. Python + Ursina / Panda3D** | Simulation Python + 3D native engine | Dễ gặp lỗi OpenGL/display driver hoặc dependency trên macOS Apple Silicon / Linux headless | Loại |
| **C. Docker bọc engine nặng** | Đóng gói toàn bộ vào container | Nặng khi tải/build trong buổi lab 4h, khó mở cửa sổ 3D trực tiếp qua `run_cmd` trên macOS | Loại |

**Phiên bản công cụ đã kiểm chứng (`npm view` & máy local):**
- Runtime: Node.js `v22.20.0`, npm `10.8.3` (tương thích macOS/Linux Node ≥ 20).
- Dependencies: `three@0.187.0` (`@types/three@0.187.0`), `vite@8.3.8`, `vitest@5.1.1`, `typescript@7.0.2`, `esbuild@0.28.2`, `@types/node@22.20.5`.

---

## 2. Architecture & Module Boundaries

Tách biệt tuyệt đối **Simulation (`src/sim/`)** khỏi **Renderer/Audio/UI (`src/client/`)** để bảo đảm tính tất định, chạy headless không GPU/DOM, và phần sáng tạo đồ họa/âm thanh không bao giờ làm sai lệch Test Contract:

```text
src/
  sim/                  # Thuần TypeScript, 0 import DOM/Three/Window
    types.ts            # GameState, Entity, InputFrame, Scenario, Event, Snapshot
    rng.ts              # Mulberry32 deterministic PRNG (cấm Math.random)
    constants.ts        # Tuning mặc định đồng bộ 1:1 với game.contract.json
    world.ts            # Khởi tạo Đảo Bến & apply Scenario (không emit event/score)
    step.ts             # stepTick(state, inputState): bước mô phỏng cố định 1/60s
    runner.ts           # Vòng lặp simulation (ticks, snapshot-every, JSONL formatting)
  headless/
    cli.ts              # Parse CLI args, validate inputs/scenario (exit 2 nếu sai), xuất JSONL
  client/
    main.ts             # Khởi tạo Three.js scene, game loop fixed-timestep 60Hz, Restart/Pause
    sceneBuilder.ts     # Đảo tròn, biển mây, Mây (nón lá + đèn treo), 5 Đèn Lồng, safe rings, đom đóm, Bóng Mực
    camera.ts           # Camera 3D góc nhìn thứ ba (chuột kéo / phím Mũi tên trái-phải điều chỉnh cam_yaw_deg)
    hud.ts              # HUD (flames, carried, lanterns, timer, score, pulse CD, hint, Win/Lose/Retry)
    audio.ts            # Web Audio procedural chimes & ambience (client-only creative feature)
tests/
  unit/                 # Unit tests cho sim
  contract/             # Integration tests chạy dist-headless/cli.mjs + kiểm tra tất định 2 lần
scripts/
  verify-all.mjs        # Chạy build + unit + contract tests + determinism check (exit != 0 nếu lỗi)
```

---

## 3. Exact `Test Contract v1.0` Specification

### A. `game.contract.json` (ở gốc repo)
```json
{
  "contract_version": "1.0",
  "team": "2A202603475-LyThanhLam",
  "build_cmd": "npm ci && npm run build",
  "run_cmd": "npm run start",
  "headless_cmd": "node dist-headless/cli.mjs",
  "tuning": {
    "player_speed": 7.0,
    "carry_capacity": 10,
    "lantern_cost": 4,
    "lantern_count_night1": 5,
    "pickup_radius": 1.8,
    "interact_radius": 2.8,
    "pulse_cost": 2,
    "pulse_radius": 7.5,
    "night1_duration_s": 240,
    "flames": 3,
    "invuln_s": 1.5,
    "hit_drop_ratio": 0.5,
    "pulse_stun_s": 2.5,
    "pulse_push_m": 5.0,
    "pulse_cooldown_s": 3.0,
    "safe_radius": 5.5,
    "shade_speed": 4.2,
    "shade_hit_radius": 1.2,
    "fall_enabled": true,
    "score": {
      "per_mote": 10,
      "per_lantern": 150,
      "per_stun": 25,
      "per_second_left": 5,
      "per_flame_left": 100
    }
  }
}
```
- Không cần trường nào khác ngoài các khóa trên.
- `run_cmd` (`npm run start`) chạy `vite preview --host 127.0.0.1 --port 4173 --open`.

### B. Tham số & Chuẩn CLI Headless
```text
node dist-headless/cli.mjs --seed <int> --night 1 [--scenario <file.json>] [--inputs <file.json>] --ticks <int> --out <file.jsonl> [--snapshot-every <int=10>]
```
- Fixed timestep: `dt = 1 / 60` s (`60` tick/giây).
- Dừng khi chạy đủ `--ticks` bước hoặc khi `state` chuyển thành `"won"` hoặc `"lost"`. Thoát mã `0`.
- Lỗi tham số hoặc lỗi file không tồn tại/I/O → thông báo ra `stderr`, thoát mã `1`.
- File `--inputs` hoặc `--scenario` sai JSON hoặc sai schema/ràng buộc → thông báo ra `stderr`, thoát mã **`2`**.
- Hệ trục: đơn vị mét, trục `+Y` hướng lên, mặt đất đảo tại `Y = 0`, người chơi mặc định xuất phát tại `(0, 0, 0)`.
- Mọi khoảng cách trong `tuning` đo giữa tâm/chân thực thể trên mặt phẳng ngang **XZ** (`Math.hypot(dx, dz) <= r`).
- Quy ước vị trí: `player.pos` là chân nhân vật; `shade.pos` là tâm Bóng Mực (mặc định `Y = 1.0`); `lantern.pos` là chân cột đèn (`Y = 0`); `mote.pos` là điểm trên mặt đất (`Y = 0`, lơ lửng chỉ ở render).

### C. Schema & Quy tắc `--inputs`
```json
{
  "frames": [
    { "tick": 0,   "move": [0, 1], "cam_yaw_deg": 0 },
    { "tick": 120, "move": [0, 0], "interact": true },
    { "tick": 121, "interact": false },
    { "tick": 200, "pulse": true },
    { "tick": 201, "pulse": false }
  ]
}
```
- Validation (vi phạm → exit `2`):
  - Root phải là object có `frames` là mảng.
  - Mỗi frame phải là object có `tick` là số nguyên `>= 0`, và **`tick` phải tăng nghiêm ngặt** (`frame[i].tick > frame[i-1].tick`).
  - Nếu có `move`: phải là mảng 2 số hữu hạn `[x, z]` (mỗi thành phần nằm trong `[-1, 1]`; thành phần ngoài `[-1, 1]` hoặc sai kiểu bị coi là sai định dạng nếu không phải số, và nếu số vượt `[-1, 1]` thì exit `2` theo đúng spec `"mỗi thành phần trong [-1, 1]"`).
  - Nếu có `cam_yaw_deg`: phải là số hữu hạn.
  - Nếu có `jump`, `interact`, `pulse`, `dash`: phải là `boolean`.
- Trạng thái input trước frame đầu tiên: `move: [0, 0]`, `cam_yaw_deg: 0`, `jump: false`, `interact: false`, `pulse: false`, `dash: false`.
- Tại mỗi tick `k`: nếu có frame với `frame.tick === k`, chỉ ghi đè các trường có mặt trong frame đó; các trường vắng mặt giữ nguyên giá trị từ tick trước.
- Công thức hướng di chuyển:
  - Nếu `Math.hypot(mx, mz) > 1`, chuẩn hóa `(mx, mz)` về độ dài `1`.
  - Với `theta = cam_yaw_deg * Math.PI / 180`:
    - `worldX = mx * Math.cos(theta) + mz * Math.sin(theta)`
    - `worldZ = -mx * Math.sin(theta) + mz * Math.cos(theta)`
- `jump`, `interact`, `pulse` kích hoạt khi giá trị chuyển từ `false` sang `true` (so với tick `k - 1`; riêng ở tick `0`, giá trị trước đó là `false`).
- Không truyền `--inputs` → giữ nguyên input mặc định (đứng yên).

### D. Schema & Quy tắc `--scenario`
```json
{
  "player": { "pos": [0, 0, 0], "carried": 0, "flames": 3 },
  "random_motes": false,
  "random_shades": false,
  "motes": [[0, 0, 5]],
  "shades": [{ "pos": [10, 0, 0] }],
  "lanterns": [{ "id": "L1", "pos": [0, 0, 25], "deposited": 0 }],
  "time_left_s": 300
}
```
- Validation (vi phạm → exit `2`): Root phải là object. Các trường hiện diện phải đúng kiểu dữ liệu (vd `player.pos` 3 số, `motes` mảng `[x,y,z]` hoặc `{id?, pos}`, `shades` mảng `{id?, pos, state?}`, `lanterns` mảng `{id, pos?, deposited?, lit?}`, `time_left_s > 0`).
- Quy tắc ghi đè (mặc định nếu vắng mặt: `random_motes = true`, `random_shades = true`, `time_left_s = night1_duration_s = 240`):
  - `lanterns`: **merge theo `id`** vào 5 đèn mặc định `L1..L5` (đèn không nhắc tới giữ nguyên; có `pos` thì đổi vị trí; có `deposited` thì đặt `deposited`; có `lit: true` thì đặt `lit: true` và giữ `deposited` theo giá trị được truyền hoặc `lantern_cost` nếu không truyền).
  - `motes`: nếu có mặt (kể cả `[]`), **thay thế toàn bộ** danh sách đom đóm ban đầu. Hỗ trợ cả phần tử `[x, y, z]` và `{ id?, pos }`. Tự gán ID `"M1"`, `"M2"`… cho phần tử chưa có `id`.
  - `shades`: nếu có mặt (kể cả `[]`), **thay thế toàn bộ** danh sách Bóng Mực ban đầu. Hỗ trợ `{ id?, pos, state? }`. Tự gán ID `"S1"`, `"S2"`… cho phần tử chưa có `id`; `state` mặc định `"chase"`.
  - `random_motes: false` → không sinh đom đóm ngẫu nhiên ban đầu và không respawn thêm.
  - `random_shades: false` → không sinh Bóng Mực ngẫu nhiên ban đầu và không spawn thêm theo thời gian.
  - Dựng scenario **không phát bất kỳ event nào và không cộng điểm** (kể cả khi đèn đặt sẵn `lit: true`).

### E. Output JSONL Schema
1. **Snapshot** (ghi ở `tick: 0` trước input tick 0, và sau mỗi `k+1` mà `(k+1) % snapshotEvery === 0`):
   ```json
   {
     "type": "snapshot",
     "tick": 120,
     "sim_tick": 120,
     "state": "playing",
     "time_left_s": 298.0,
     "score": 20,
     "player": { "pos": [0.0, 0.0, 12.0], "flames": 3, "carried": 2 },
     "lanterns": [{ "id": "L1", "pos": [0, 0, 25], "lit": false, "deposited": 0 }],
     "shades": [{ "id": "S1", "pos": [30.1, 1.0, 2.0], "state": "chase" }],
     "motes": [{ "id": "M1", "pos": [0, 0, 5] }],
     "motes_active": 19
   }
   ```
   - `motes` được xuất kèm mỗi phần tử `{ id, pos }` theo khuyến nghị v1.0.
   - Tọa độ `pos` và `time_left_s` làm tròn 3 chữ số thập phân khi tuần tự hóa (`round3(v)`). Phép tính `time_left_s` bên trong giữ dạng `Math.max(0, initial_time_left_s - sim_tick / 60)` để không tích lũy sai số làm tròn.
2. **Event** (ghi ngay khi phát sinh trong bước `k`, mang `"tick": k + 1`):
   - `mote_picked`: `{"carried": n}`
   - `deposit`: `{"lantern_id": "L1", "amount": n, "deposited": n}`
   - `lantern_lit`: `{"lantern_id": "L1"}`
   - `pulse`: `{"stunned_ids": ["S1"]}`
   - `player_hit`: `{"by": "shade" | "fall", "flames": n, "dropped": n}`
   - `shade_spawned`: `{"id": "S3"}`
   - `game_over`: `{"result": "won" | "lost", "reason": "all_lit" | "dawn" | "no_flames"}`
3. **End** (dòng cuối cùng và bắt buộc):
   - `{"type": "end", "ticks": <sim_tick>, "state": <"playing" | "won" | "lost">, "score": <number>}`

---

## 4. Exact Simulation Rules, Intra-Tick Order & Edge Cases

### Hình học & Khởi tạo mặc định (`random_motes: true` / `random_shades: true`)
- **Đảo tròn:** tâm `(0, 0, 0)`, bán kính `R_ISLAND = 36.0` m, mặt đất `Y = 0`.
- **5 Đèn Lồng Lớn (`L1..L5`):** Đặt cách đều trên vòng tròn `R = 22.0` m:
  - `L1`: `[0, 0, 22]`, `L2`: `[20.923, 0, 6.798]`, `L3`: `[12.931, 0, -17.798]`, `L4`: `[-12.931, 0, -17.798]`, `L5`: `[-20.923, 0, 6.798]`.
- **PRNG & ID Sequence:**
  - Dùng một stream `mulberry32(seed)` duy nhất trong `SimState`.
  - Bộ đếm `nextMoteSeq`, `nextShadeSeq` khởi tạo bằng `(max số hậu tố hiện có trong M*/S*) + 1` (tối thiểu `1`) và luôn bỏ qua ID đã tồn tại để không bao giờ trùng khi scenario truyền sẵn ID.
- **Đom đóm ban đầu (`random_motes: true`):** Sinh `28` đom đóm (`M1..M28`) phân bố ngẫu nhiên có seed trên hình vành khăn `r ∈ [6, 30]` m, giữ khoảng cách tối thiểu `2.5` m giữa các đom đóm (fallback sau 30 lần thử). Cadence respawn: mỗi `300` tick (`5` s), nếu `motes.length < 28` và `motes.length + carried + sum(deposited) < 35`, sinh thêm `1` đom đóm tại `r ∈ [6, 30]` m ngoài `pickup_radius` của người chơi.
- **Bóng Mực ban đầu (`random_shades: true`):** Sinh `3` Bóng Mực (`S1..S3`) tại `Y = 1.0`, `r ∈ [26, 32]` m (gần rìa đảo, xa gốc `(0,0,0)` ≥ `26` m và ngoài `safe_radius` các đèn đã sáng). Cadence spawn thêm: mỗi `1500` tick (`25` s), nếu `shades.length < 6`, sinh `1` con mới tại `r ∈ [26, 32]` m, cách `player.pos` ít nhất `14` m và ngoài `safe_radius` đèn đã sáng, emit `shade_spawned`.

### Thứ tự thực thi trong 1 tick (`stepTick`, biến `k` → `tick = k + 1`)
1. **Guard:** Nếu `state !== "playing"`, trả về ngay (no-op).
2. **Tiến trình thời gian & cooldown:**
   - `sim_tick += 1`
   - `invuln_remaining = Math.max(0, invuln_remaining - dt)`
   - `pulse_cooldown_remaining = Math.max(0, pulse_cooldown_remaining - dt)`
   - `time_left_s = Math.max(0, initial_time_left_s - sim_tick / 60)`
3. **Input & Di chuyển + Nhảy người chơi:**
   - Tính sườn lên `jumpPressed`, `interactPressed`, `pulsePressed` so với tick trước, cập nhật `prevInputs`.
   - Tính `(worldX, worldZ)` từ `move` & `cam_yaw_deg`; cập nhật `player.pos[0] += worldX * player_speed * dt`, `player.pos[2] += worldZ * player_speed * dt`.
   - Nếu `jumpPressed && player.pos[1] === 0 && distXZ(player.pos, [0,0,0]) <= 36.0`, đặt `player_vy = 6.5`.
   - Nếu `player.pos[1] > 0 || player_vy !== 0 || distXZ(player.pos, [0,0,0]) > 36.0`:
     `player_vy += -18.0 * dt`, `player.pos[1] += player_vy * dt`.
   - Nếu `distXZ(player.pos, [0,0,0]) <= 36.0 && player.pos[1] <= 0 && player_vy <= 0`: đặt `player.pos[1] = 0`, `player_vy = 0`.
4. **Kiểm tra rơi khỏi đảo (`fall_enabled === true`):**
   - Nếu `player.pos[1] <= -4.0`:
     - Nguy hiểm rơi áp dụng kể cả khi đang có `invuln_remaining` (vì là rơi khỏi đảo, không phải va chạm Bóng Mực).
     - `flames = Math.max(0, flames - 1)`
     - `dropped = Math.floor(carried * hit_drop_ratio)` *(cố ý dùng `Math.floor`, vd `carried = 1` → `dropped = 0`)*
     - `carried -= dropped`
     - Hồi sinh Mây về `[0, 0, 0]`, `player_vy = 0`, `invuln_remaining = invuln_s`.
     - Emit `player_hit {"by":"fall","flames":flames,"dropped":dropped}`.
     - Nếu `flames <= 0`: `state = "lost"`, emit `game_over {"result":"lost","reason":"no_flames"}`, **dừng tick ngay**.
5. **Nhặt đom đóm (`mote_picked`):**
   - Duyệt `motes` theo thứ tự ID tăng dần (tính tất định): nếu `carried < carry_capacity` và `distXZ(player.pos, mote.pos) <= pickup_radius` (`1.8` m), xóa đom đóm, `carried += 1`, `score += score.per_mote`, emit `mote_picked {"carried": carried}`.
6. **Tỏa sáng (`pulse`):** *(chạy trước Bóng Mực đuổi/va chạm để Tỏa Sáng cứu kịp người chơi trong cùng tick)*
   - Nếu `pulsePressed && pulse_cooldown_remaining <= 0 && carried >= pulse_cost`:
     - `carried -= pulse_cost`, `pulse_cooldown_remaining = pulse_cooldown_s`.
     - Duyệt `shades` theo thứ tự ID tăng dần: nếu `distXZ(player.pos, shade.pos) <= pulse_radius` (`7.5` m):
       - Tính vector XZ đơn vị `dir = normalizeXZ(shade.pos - player.pos)` (nếu trùng XZ thì `dir = [0, 1]`).
       - Đẩy `shade.pos` thêm `pulse_push_m` (`5.0` m) theo `dir` (không kẹp bởi `R_ISLAND` vì Bóng Mực sống trong sương quanh đảo, chỉ kẹp bán kính sương ngoài `45.0` m), sau đó áp dụng đẩy ra ngoài `safe_radius` của các đèn đã sáng.
       - Đặt `shade.state = "stunned"`, `shade.stun_remaining = pulse_stun_s` (`2.5` s).
       - `score += score.per_stun`, thêm `shade.id` vào `stunned_ids`.
     - Emit `pulse {"stunned_ids": stunned_ids}`.
7. **Nạp ánh sáng & Thắp Đèn (`deposit`, `lantern_lit`, `all_lit`):**
   - Nếu `interactPressed && carried > 0`:
     - Tìm Đèn Lồng `!lit` có `distXZ(player.pos, lantern.pos) <= interact_radius` (`2.8` m), ưu tiên khoảng cách nhỏ nhất rồi đến `id` tăng dần.
     - Nếu tìm thấy và `amount = Math.min(carried, lantern_cost - lantern.deposited) > 0`:
       - `carried -= amount`, `lantern.deposited += amount`, emit `deposit {"lantern_id": lantern.id, "amount": amount, "deposited": lantern.deposited}`.
       - Nếu `lantern.deposited >= lantern_cost`:
         - `lantern.lit = true`, `score += score.per_lantern`, emit `lantern_lit {"lantern_id": lantern.id}`.
       - Nếu tất cả `5` đèn đều `lit`:
         - `score += Math.floor(time_left_s) * score.per_second_left + flames * score.per_flame_left`
         - `state = "won"`, emit `game_over {"result":"won","reason":"all_lit"}`, **dừng tick ngay** *(ưu tiên thắng trước `dawn` nếu xảy ra cùng tick cuối)*.
8. **Spawn định kỳ (`random_motes`, `random_shades`):** Thực hiện theo cadence ở trên nếu cờ tương ứng là `true`.
9. **Hành vi Bóng Mực, `safe_radius` & Va chạm (`player_hit`):**
   - Duyệt `shades` theo thứ tự ID tăng dần:
     - Nếu `shade.state === "stunned"`: `shade.stun_remaining -= dt`. Nếu `shade.stun_remaining <= 0`, chuyển `shade.state = "chase"`, `shade.stun_remaining = 0`.
     - Ngược lại (`state === "chase"`):
       - Di chuyển theo vector đơn vị hướng về `player.pos` trên XZ một đoạn `shade_speed * dt` (`4.2 / 60` m).
       - **Đẩy khỏi `safe_radius` (`5.5` m) của mọi đèn đang `lit` (lặp 2 vòng để xử lý đèn chồng vùng):** nếu `distXZ(shade, lantern) < safe_radius`, đặt lại lên biên `safe_radius + 0.001` theo hướng xuyên tâm; nếu hướng tới người chơi bị cản bởi đèn, cộng thêm trượt tiếp tuyến `0.5 * shade_speed * dt` theo dấu tích có hướng `(lantern->shade) × (lantern->player)` (quy ước dấu `0` chọn `+1` ngược chiều kim đồng hồ) rồi kẹp lại `>= safe_radius`.
       - **Kiểm tra chạm người chơi:** Nếu `shade.state === "chase"` và `invuln_remaining <= 0` và `distXZ(player.pos, shade.pos) <= shade_hit_radius` (`1.2` m) *(đo trên XZ theo Test Contract B, áp dụng cả khi đang nhảy)*:
         - `flames = Math.max(0, flames - 1)`
         - `dropped = Math.floor(carried * hit_drop_ratio)`
         - `carried -= dropped`, `invuln_remaining = invuln_s`.
         - Emit `player_hit {"by":"shade","flames":flames,"dropped":dropped}`.
         - Nếu `flames <= 0`: `state = "lost"`, emit `game_over {"result":"lost","reason":"no_flames"}`, **dừng tick ngay**.
10. **Hết giờ bình minh (`dawn`):**
    - Nếu `state === "playing"` và `time_left_s <= 0`:
      - `state = "lost"`, emit `game_over {"result":"lost","reason":"dawn"}`.

---

## 5. PRD-0 Client, Visuals, Controls & Deliverables

### Yêu cầu đồ họa & trải nghiệm (PRD-0 Mục 2 & 3)
- **Thế giới 3D:** Hòn đảo tròn có viền đá phát sáng nhẹ phía trên biển mây; bầu trời đêm chuyển dần từ tím đen sang ánh vàng cam ấm mỗi khi thắp thêm một Đèn Lồng.
- **Mây:** Nhân vật stylized đội **nón lá** có **đèn lồng nhỏ màu vàng cam treo ở vành nón** phát sáng quanh nhân vật; hoạt ảnh bước chạy, nhảy, và vòng sóng Tỏa Sáng vàng rực.
- **Đom đóm & Đèn Lồng Lớn:** Đom đóm bay lơ lửng (`Y` dao động thị giác, logic tại `Y = 0`); 5 Đèn Lồng Lớn hiển thị tiến độ nạp sáng và vòng hào quang `safe_radius` (`5.5` m) trên mặt đất khi sáng.
- **Bóng Mực:** Sinh vật tím đen rùng rợn nhẹ nhàng (không bạo lực/máu me) với mắt tím phát sáng, chuyển trạng thái đóng băng ánh vàng khi `stunned`.
- **Điều khiển (Client):**
  - `W/A/S/D`: di chuyển theo hướng camera (`cam_yaw_deg`).
  - `Kéo chuột` hoặc `Mũi tên Trái/Phải`: xoay camera 3D (`cam_yaw_deg`). *(Tránh dùng `Q/E` để không trùng phím tương tác `E`)*.
  - `Space`: nhảy.
  - `E` hoặc `F`: nạp ánh sáng vào Đèn Lồng Lớn.
  - `Shift` hoặc `R` hoặc `Chuột phải`: Tỏa sáng (`pulse`).
  - `P` / `Esc`: tạm dừng; `M`: bật/tắt âm thanh; nút **Chơi lại** (và phím `Enter` ở màn hình kết thúc) để chơi lại Đêm 1 sau khi thắng/thua.
- **HUD:** Số máu/ngọn lửa (`flames / 3`), số đom đóm đang mang (`carried / 10`), số đèn đã thắp (`x / 5`), thời gian còn lại, điểm số, thanh hồi chiêu Tỏa sáng, gợi ý tương tác theo ngữ cảnh, màn hình Thắng/Thua kèm lý do & bảng điểm.

### Sáng tạo của tôi (Tách biệt hoàn toàn khỏi headless)
- **Web Audio procedural fairytale soundscape (`src/client/audio.ts`):** Âm thanh chuông gió khi nhặt đom đóm, hợp âm ấm khi thắp đèn, tiếng cộng hưởng khi Tỏa sáng.
- **Cảnh quan đảo thức tỉnh (`src/client/sceneBuilder.ts`):** Tinh thể/hoa đom đóm ven cột đèn bừng sáng và sương tím lùi xa dần theo số đèn đã thắp.

### Bàn giao Phase 1
1. `game.contract.json` + CLI headless `node dist-headless/cli.mjs` tuân thủ Test Contract v1.0.
2. Mã nguồn hoàn chỉnh chơi được Đêm 1, thắng/thua/chơi lại.
3. `README.md` (tối đa 3 lệnh cài & chạy trên macOS/Linux, điều khiển, cách tính điểm, mục `"Sáng tạo của tôi"` + bằng chứng không phá lõi). *(Lưu trữ README đề bài gốc tại `docs/lab/LAB_README.md`)*.
4. Harness AI: `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `.github/workflows/ci.yml`, `scripts/verify-all.mjs`.
5. Ghi chép & bằng chứng: `docs/notes/phase-1-assumptions.md`, `docs/notes/ai-log.md`, `docs/proof/phase-1-proof.md`, kịch bản JSON/JSONL kiểm chứng, và tag `phase-1` trên `origin` (`LysLama/K5-L3A-DAY12-LyThanhLam-2A202603475-AI-SDLC-Dao-Den-Long`).
