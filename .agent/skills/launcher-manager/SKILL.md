---
name: launcher-manager
description: Cấu hình và khởi phát trò chơi AOE 1 từ BP-Arena
---

# AOE Launcher Manager Skill

Kỹ năng này tập trung vào việc đảm bảo trò chơi Age of Empires (AOE) 1 có thể khởi chạy mượt mà từ ứng dụng BP-Arena.

## 🗂️ Chức năng chính
1. **Registry Sync**: Cập nhật tên người chơi và các thiết lập game vào Windows Registry.
2. **CWD Management**: Đảm bảo game chạy trong đúng thư mục gốc để tải đủ file dữ liệu.
3. **Compatibility Patching**: Hướng dẫn thêm các file `.dll` sửa lỗi màu sắc (color fix) cho Windows 10/11.

## 🛠️ Cách sử dụng
- Khi người dùng thay đổi đường dẫn game trong cài đặt, hãy sử dụng script `check_game_path.js` để xác minh.
- Trước khi khởi động game, hãy gọi `sync_name.ps1` để đồng bộ tên từ tài khoản Arena.

## 💡 Các tham số dòng lệnh tham khảo cho AOE 1
- `systemmemory`: Dành cho các máy cấu hình thấp.
- `nostartup`: Bỏ qua các đoạn phim giới thiệu để vào game nhanh hơn.
- `join <IP>`: Tự động tham gia vào phòng có IP chỉ định.

## ⚠️ Lưu ý kỹ thuật cho AOE 1 HD
Đối với phiên bản AOE HD mà người dùng đang sử dụng (`Empiresxhd.exe`), hãy lưu ý rằng bản này có thể yêu cầu quyền Administrator để ghi vào registry hoặc truy cập các thư mục downloads.
