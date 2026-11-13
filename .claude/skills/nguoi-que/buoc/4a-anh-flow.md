# Tạo ảnh bằng Google Flow

Trả lời bằng tiếng Việt. Đây là cách tạo ảnh duy nhất của quy trình (0đ, không API); tốn token Claude và cần Chrome. Mỗi lựa chọn của người dùng ghi vào `NHAT_KY_QUY_TRINH.md`.

**Ảnh một cảnh (nền + nhân vật gộp chung, đứng yên)**: dùng đúng quy trình Flow trong file này. **Thư viện hành động nhân vật tái sử dụng** (8 frame PNG nền trong suốt thật, dùng ChatGPT thủ công — không qua Flow, không gọi API) dùng `buoc/4b-thu-vien-hanh-dong.md` thay thế hoàn toàn.

## Điều kiện
- Có công cụ Claude in Chrome (`list_connected_browsers`). Người dùng tự đăng nhập Flow trong Chrome, tài khoản có huy hiệu **PRO**; nhiều tài khoản thì URL dạng `flow.google.com/u/1/`. Không bao giờ hỏi/nhập mật khẩu.
- Chrome cho phép flow.google.com "truy cập ứng dụng và dịch vụ khác trên thiết bị" (lần đầu Chrome hỏi; nhắc người dùng bấm Cho phép). "Tải xuống nhiều tệp" thì Chặn.
- Có `scenes.json` (bước 3) và `projects/<video>/assets.json` (nền + sự vật, xem mẫu ở `projects/_mau/assets.json`).

## 1. Chuẩn bị (máy)
```bash
python tools/flow_jobs.py projects/<video> assets          # rồi sau đó: ... scenes [--only 3 5]
python tools/flow_receiver.py projects/<video>/_flow --port 8767     # chạy nền
```
`flow_jobs.py` ghi `_flow/jobs.json` (tên việc, prompt đầy đủ, tên ảnh tham chiếu) và chép ảnh tham chiếu vào `_flow/refs/` với **tên riêng** (`ref_ban_scared.png`, `ref_bg_trai.png`…), để gắn đúng ảnh theo tên.

## 2. Trang Flow (Chrome)
1. Mở dự án Flow (mới hoặc của video). Chip model: Hình ảnh, 16:9, Nano Banana mới nhất, x2. **Dòng "Quá trình tạo sẽ tốn … tín dụng" phải là 0**, khác 0 thì dừng hỏi người dùng.
2. Dán nội dung `tools/flow_page.js` bằng javascript_tool, rồi `await F.load(8767)`.
3. Tải ảnh tham chiếu: `await F.openUpload()` → `find` "file input claude_file_input" → `file_upload` các file trong `_flow/refs/` → phím Escape thật. (Nút tải lên của Flow mở hộp chọn file Windows; `flow_page.js` chặn lại để dùng file_upload.)
4. Gửi việc theo lượt, **mỗi lượt tối đa 8–10 việc** trong một `browser_batch`: `javascript_tool "await F.prepare(i)"` (tự gắn ảnh tham chiếu theo tên + điền prompt; kết quả `[tên, số ảnh đã gắn, ok…]`) rồi **phím Enter thật** (Enter giả lập và bấm nút bằng JS không gửi được), chờ 2 giây, việc tiếp theo.
5. Chờ ~50 giây (5 × wait 10), kiểm tra số ảnh 16:9 trong trang tăng đủ 2 × số việc, rồi `await F.save([tên các việc của lượt, theo thứ tự gửi])` → ảnh về `_flow/<tên>_a.jpg`, `_b.jpg`.
6. Thấy CAPTCHA, cảnh báo, giới hạn lượt, yêu cầu đăng nhập: dừng ngay, báo người dùng. Không xoá dự án/ảnh, không mua tín dụng.

## 3. Chọn ảnh (máy)
- Ghép bảng đôi a/b (Pillow) và soi: đúng nhân vật/đạo cụ, đúng số người, không chữ, đúng nền, bố cục khớp lời thoại.
- Asset: chọn rồi lưu `projects/<video>/assets/<tên>.png` (nền giữ 16:9; sự vật/nhân vật phụ cắt vuông giữa ảnh).
- Cảnh: chọn rồi lưu `scenes/NN.png`. Cả hai hỏng thì sửa prompt trong storyboard/scenes.json, `flow_jobs.py … scenes --only NN`, chạy lại (tối đa 2 lần).
- Làm bảng duyệt đánh số: `.venv/Scripts/python.exe tools/review_sheet.py projects/<video>` → `review_sheet.jpg`. **Điểm duyệt:** gửi bảng cho người dùng.

## Giới hạn an toàn (dùng Flow lâu dài)
Flow là dịch vụ cho người dùng tương tác; Google không công bố hạn mức ảnh/ngày và điều khoản cấm lạm dụng hoặc tự động hoá quá mức. Claude chỉ thao tác như người dùng (một tab, gõ prompt, Enter thật), và luôn giữ nhịp chậm:
- **Mỗi việc cách nhau 4 giây**; **mỗi lượt tối đa 10 việc**; giữa hai lượt nghỉ ít nhất 60 giây (thời gian chờ ảnh + soi ảnh).
- **Mỗi phiên tối đa ~60 việc** (~120 ảnh, ~25 phút), rồi **nghỉ 15 phút** (Claude dùng lúc nghỉ để viết storyboard chương sau, chọn ảnh).
- **Mỗi ngày tối đa ~500 việc / tài khoản** (8 phiên × 60 + làm lại), đủ cho một video 20 phút nhịp 3 giây (~450 việc, xem skill nguoi-que). Đây là mức Claude tự đặt, **chưa kiểm chứng**; Google không công bố hạn mức. Mọi dấu hiệu bất thường đều báo người dùng ngay.
- Không chạy song song nhiều tab/tài khoản, không chạy khi người dùng vắng mặt.
- **Có dấu hiệu bị chặn** (bên dưới) → dừng, chờ ít nhất 1 giờ rồi thử 1 việc; vẫn bị → phần còn lại chuyển sang tài khoản PRO thứ hai (nếu người dùng có) hoặc để phần còn lại sang hôm sau. Báo người dùng để họ chọn.
- Mỗi cảnh làm lại tối đa 2 lần; hỏng nữa thì sửa prompt hoặc để người dùng quyết.
- **Dừng ngay** và báo người dùng khi thấy: CAPTCHA, "thử lại sau", "đã đạt giới hạn", tín dụng khác 0, ảnh ra chậm bất thường (> 3 phút), cảnh báo tài khoản. Không tìm cách vượt.
- Dùng tài khoản phụ có gói PRO nếu được, để tài khoản Google chính không bị ảnh hưởng nếu có hạn chế.

## Lỗi đã biết
| Hiện tượng | Xử lý |
|---|---|
| Ảnh tham chiếu biến mất sau khi gửi | Bình thường; `F.prepare` gắn lại mỗi việc |
| Hộp Save As hiện ra, trang treo | Đã dùng `<a download>`; chỉ tải qua `F.save` (flow_receiver) |
| `Failed to fetch` khi tải | flow_receiver chưa chạy hoặc Chrome chặn quyền thiết bị; không truyền `targetAddressSpace` |
| Dấu ✦ nhỏ góc phải dưới ảnh | Watermark Gemini; khi dựng phóng nhẹ hoặc cắt góc nếu lộ |
| Ảnh 1376×768 | CapCut phóng lên 1920×1080, hơi mềm; chấp nhận |

Lần đầu (2026-11-03, so-bong-toi): 8 asset = 8 lệnh × 2 ảnh trong ~1 phút, 0 tín dụng.
