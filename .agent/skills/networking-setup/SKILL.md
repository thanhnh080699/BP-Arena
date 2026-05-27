---
name: networking-setup
description: Thiết lập mạng LAN nội bộ và UDP Proxy giúp các máy thấy phòng game
---

# AOE Networking Skill

Kỹ năng này tập trung vào khía cạnh quan trọng nhất của AOE Arena: **Kết nối người chơi**.

## 🌐 Các chế độ mạng đề xuất
1. **Direct LAN**: Dành cho các máy trong cùng một văn phòng/Wifi.
2. **UDP Broadcast Forwarder**: Sử dụng khi người chơi ở các phòng ban/chi nhánh khác nhau trong công ty. Bản chất là forwarding gói tin UDP ở các cổng:
   - **47624**: Cổng ban đầu của DirectPlay.
   - **2300 - 2400**: Các cổng dữ liệu game (TCP & UDP).

## 💡 Cách thực hiện với Golang Backend
Chúng ta có thể sử dụng Go để viết một module UDP Proxy nhỏ:
- Lắng nghe gói tin Broadcast (255.255.255.255) từ máy chủ phòng.
- Chuyển tiếp các gói tin này tới IP của tất cả các máy khách trong Lobby.
- Điều này đánh lừa AOE tưởng rằng các máy đang ở trong cùng một LAN vật lý.

## ⚠️ Giải quyết lỗi 'Unable to Join'
- Kiểm tra lại Windows Firewall: Luôn yêu cầu mở quyền cho `Empiresxhd.exe` và `BP-Arena.exe`.
- Bật tính năng **DirectPlay** trong Windows Features (Legacy Components).
