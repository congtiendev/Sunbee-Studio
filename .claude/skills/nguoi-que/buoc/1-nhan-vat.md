# Tạo bộ nhân vật gốc

Trả lời bằng tiếng Việt, ngắn gọn. Mỗi lựa chọn của người dùng ghi một dòng vào `NHAT_KY_QUY_TRINH.md` (mục "Khâu nhân vật").

## 1. Hỏi (gộp một câu hỏi)
- Ý tưởng kênh: chủ đề, người xem, giọng (vui/nghiêm túc).
- Video hoặc ảnh mẫu thích (link YouTube, ảnh chụp). Không có cũng được.
- Bao nhiêu nhân vật, vai gì (người dẫn, đại diện người xem, chuyên gia, nhân vật đối lập).
- **Ảnh gửi kèm là nhân vật thật sự muốn dùng, hay chỉ ảnh mẫu phong cách?** Nếu người dùng xác nhận đây là nhân vật đã chốt (không chỉ học cách vẽ) → **bỏ qua bước 2–4**, sang thẳng bước 5 dùng ảnh đó làm thiết kế đã chọn.

## 2. Xem mẫu (nếu có link YouTube)
Mở trong Chrome (Claude in Chrome), tắt tiếng, tua 6–8 mốc rải đều, chụp riêng vùng video ở tỉ lệ 0,4–0,45 (~600 token/khung). Không tải video về. Ghi lại: kiểu nhân vật, đạo cụ đặc trưng, kiểu nền, kiểu thẻ giải thích, tông màu. **Chỉ học cách làm, không chép** nhân vật, màu áo, đạo cụ của kênh mẫu.

## 3. Đề xuất 3 phương án
Mỗi phương án: vai nhân vật, ngoại hình, **một đạo cụ đặc trưng**, **một màu áo riêng**, hợp chủ đề thế nào, ưu/nhược (nhiều chi tiết thì khó giữ đồng nhất qua nhiều cảnh). Nêu phương án Claude nghiêng về và vì sao. Hỏi thêm kiểu nền (màu đầy đủ theo thời kỳ hay nền trắng tối giản).

## 4. Bản phác trên Flow
Làm theo cách dùng Flow trong `buoc/4a-anh-flow.md`: tab đúng tài khoản PRO, đọc dòng tín dụng phải là 0, chạy `tools/flow_receiver.py characters/<bo>/_phac --port 8766`.
- **Style "nét nâu giấy"**: đính kèm `characters/_style-ref/chibi-style-target.png` và `characters/_style-ref/line-and-paper-reference.png` làm STYLE ONLY ở mọi lệnh tạo ảnh của bước này (chỉ học cách vẽ, không chép người/vật trong 2 ảnh mẫu).
- Mỗi phương án một lệnh (Flow ra 2 ảnh): "Character design sheet, two characters side by side, full body, front view, plain pure white background, no text. Style: thick slightly irregular dark-brown crayon/pencil outlines (not uniform black vector), muted matte flat colors, restrained simple shadows, subtle warm paper grain, rounded simplified forms. Chibi proportions: oversized rounded head, compact body ~2.5–3 heads tall, small rounded hands and feet, expressive round eyes. Keep each character's distinguishing features (hair, face shape, glasses, outfit, signature prop/color) clearly different from one another."
- Điền prompt bằng JS (`execCommand('insertText')`), gửi bằng phím Enter thật.
- Tải về, ghép `bang_chon_phac.jpg` (Pillow), gửi người dùng chọn. Người dùng có thể ghép nhân vật từ các phương án khác nhau.

## 5. Ảnh gốc và biến thể
- Ảnh gốc: nếu đi từ bản phác (bước 4) → cắt bản phác thành từng nhân vật, đệm vuông nền trắng → `characters/<bo>/<nhan-vat>/main.png`. Nếu đi thẳng từ ảnh nhân vật người dùng gửi (bỏ qua bước 2–4) → đệm vuông nền trắng ảnh đó, lưu thẳng thành `characters/<bo>/<nhan-vat>/main.png`, không cần sketch/chọn phương án.
- Tải ảnh gốc lên Flow, sinh biến thể (mỗi lệnh gắn lại ảnh tham chiếu + 2 ảnh style-ref, vì Flow gỡ hết sau mỗi lần gửi): "Same exact character as the reference image (identity, outfit, proportions, palette and linework unchanged)… New pose/expression: …". Tối thiểu mỗi nhân vật 3 biểu cảm hay dùng (sợ, ngạc nhiên, giải thích/cười), nhân vật hiện đại thêm bản mặc đồ thời quá khứ nếu kênh có du hành thời gian.
- Chọn ảnh tốt hơn trong mỗi cặp (đúng mặt, đúng đạo cụ, đủ ngón, không chữ, đúng style nét nâu giấy), cắt vuông giữa ảnh → `<nhan-vat>/<bieu-cam>.png`. Ghép `bang_bieu_cam.jpg` cho người dùng duyệt.

## 6. Lưu bộ
- `characters/<bo>/characters.json`: `style` = copy đúng đoạn "Style ảnh nét nâu giấy" trong `SKILL.md` (mục "Chuẩn kênh"), kèm luật "không thêm người, không chữ"; mỗi nhân vật có `name`, `ref`, `prompt` (tiếng Anh, tả ngoại hình + đạo cụ + màu áo riêng — không lặp lại mô tả nét vẽ chung, phần đó đã nằm trong `style`), `variants` {tên: đường dẫn}.
- `characters/<bo>/README.md`: bảng mã nhân vật, ảnh, biến thể, nguồn gốc ý tưởng.
- Báo người dùng: video dùng bộ này chạy `scenes.py plan --cast characters/<bo>/characters.json`; trong storyboard gọi `ban:scared`, `ongto:explaining`…

Ví dụ đã làm: `characters/ban-ong-to/` (2026-11-03): 3 phương án → chọn 1B → 7 biến thể, tổng ~20 ảnh Flow, 0đ.
