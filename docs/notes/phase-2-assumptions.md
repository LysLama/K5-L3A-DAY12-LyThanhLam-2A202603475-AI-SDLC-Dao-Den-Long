# Giả định & Quyết định Thiết kế Phase 2 (TICKET-02 · Contract v1.1)

| Hạng mục | Giả định / Quy ước đã chốt | Căn cứ TICKET-02 / Hệ quả kiểm thử |
|---|---|---|
| Hệ tọa độ cực cho Đèn & Dốc | Quy ước `x = r · cos(θ), z = r · sin(θ)` với `+Z` hướng về `90°` | Khớp tọa độ Đèn Đêm 1 (`L1=[0,0,25]`, `L2=[23.8,0,7.7]`) và Đèn Đêm 3 trên tầng 1 `z > 0` (`30°`, `150°`). |
| Gia tốc & phanh di chuyển | Gia tốc `80 m/s²` (`0.075 s` đạt `6.0 m/s`, `0.09 s` đạt `7.2 m/s` và dừng trong `≤ 0.1 s`), điều khiển đầy đủ cả trên không | Đảm bảo độ nhạy chính xác theo quy định `≤ 0.1 s` của TICKET-02 Phần 1. |
| Phím tắt hành động không đè nhau | `Shift` gán cho **Lướt** (`Dash`); `Q`, `R` và `Chuột phải` gán cho **Tỏa Sáng** (`Pulse`); `Esc` / `P` cho **Tạm dừng** | Tách biệt rõ hai kỹ năng mới tránh xung đột phím khi di chuyển bằng `WASD` và `E`/`F` nạp đèn. |
| Ngưỡng đáp địa hình dốc & tầng Đêm 3 | Kiểm tra mặt phẳng hợp lệ theo `fy <= currentY + 0.35`, ưu tiên độ cao cao nhất không xuyên vách đứng (`r=8m` tầng 2 và vách nửa vòng tầng 1) | Cho phép đi mượt qua dốc `30°`/`150°` nhưng chặn tuyệt đối việc trèo thẳng qua vách đá dựng đứng. |
| Ràng buộc Tháp chuông Đêm 3 | Trụ đặc bán kính `2.0 m` (`Y < 14 m`), chặn cả chuyển động Mây lẫn vector đẩy Tỏa Sáng của Bóng Mực | Giữ Mây và Bóng Mực luôn ngoài bán kính `r >= 2.0 m` quanh `(0, 6, 0)`. |
| Tạm dừng (`pause`) trên sườn lên | Kích hoạt khi `pause` chuyển `false -> true`; tăng `tick`, đóng băng `sim_tick`, đồng hồ, hồi chiêu, TTL và lịch sinh | Đảm bảo client gọi nhả cạnh ngay trong sim khi ấn Pause để nút `Tiếp tục` luôn mở khóa đúng. |
| Cô lập phần sáng tạo khỏi Headless | Nhạc nền drone & 14+ SFX Web Audio, hiệu ứng lá gió/tia lướt, menu/intro Ông Đăng và mũi tên chỉ đèn đặt 100% trong `src/client/` | Headless CLI `dist-headless/cli.mjs` giữ nguyên 100% đầu ra tất định trên cả 3 Đêm. |
