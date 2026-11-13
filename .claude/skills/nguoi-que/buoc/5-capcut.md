# Dựng dự án CapCut

Trả lời bằng tiếng Việt. Lệnh này **phải** chạy bằng Python trong `.venv`.

## 1. Dựng
```bash
.venv\Scripts\python.exe tools\build_capcut.py projects\<video>     # Windows
.venv/bin/python tools/build_capcut.py projects/<video>              # Mac
```
- Tự bật server VectCutAPI (localhost:9001) với UTF-8, dựng xong tự tắt.
- Dự án gồm: track `voice`, track `images` (ảnh cắt 16:9, khớp giờ cảnh), phụ đề. **Cắt thẳng, không chuyển cảnh.**
- Mặc định: **ảnh đứng yên, không keyframe**; **không sound effect** (anh bỏ 2026-11-03).
- Tuỳ chọn: `--until 20` (chỉ dựng cảnh 1–20 để xem trước), `--sfx` (bật lại sound effect theo nhát cắt, chỉ khi người dùng yêu cầu), `--no-subtitles`, `--motion` (bật lại chuyển động keyframe cũ, chỉ khi người dùng yêu cầu).
- Ghi thẳng vào thư mục nháp CapCut, in mã dạng `dfd_cat_...`. Script tự dừng báo lỗi nếu dự án lưu không đủ.

Chuẩn kênh, **không tự đổi** khi chưa hỏi người dùng: phụ đề Nunito đậm cỡ 6, trắng viền đen, `transform_y` -0.82; khung 1920x1080; không keyframe; không logo (anh bỏ 2026-11-03).

## 2. Kiểm tra sau khi dựng
Đọc `draft_info.json` trong thư mục dự án (Windows `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft\<mã>`, Mac `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/<mã>`):
- Có track audio `voice` 1 đoạn, track `images` đủ số cảnh, track `sfx*` đủ số âm, track text có phụ đề.
- Thư mục `assets/` có ảnh và audio.
- `duration` bằng độ dài voice.

## 3. Bản nghe thử (khi có hiệu ứng âm thanh)
```bash
<python .venv> tools/preview_mix.py projects/<video>
```
Ra `projects/<video>/nghe_thu_voice_va_sfx.mp3` (voice trộn âm thanh đúng giờ, đúng âm lượng như trong CapCut). Gửi người dùng để nghe không cần mở CapCut.

## 4. Báo người dùng
- Mã dự án, số cảnh, danh sách chuyển động và âm thanh (dòng `Motion:` và `Sound FX:`).
- Nhắc: **tắt hẳn CapCut rồi mở lại** mới thấy dự án. Xem: voice khớp hình, phụ đề đúng, cảnh cắt cận/nhấn phóng đúng mặt nhân vật, âm thanh không đè giọng.
- Việc người dùng tự làm trong CapCut: nhạc nền, intro/outro, logo, xuất 1080p.

## 5. Sửa dự án
- **Chưa chỉnh tay trong CapCut**: sửa `storyboard.json` và `scenes.json` (chuyển động, focus, sfx…) rồi dựng lại; ra mã mới. Bản cũ **không tự xoá**: báo người dùng mã bản cũ để họ xoá trong CapCut, hoặc chỉ xoá khi họ đồng ý **và** thư mục không có file `.locked` (CapCut đang mở nó; xoá lúc đó làm hỏng dự án dở dang — lỗi đã gặp 2026-11-03).
- **Đã chỉnh tay trong CapCut**: dựng lại sẽ mất phần chỉnh tay. Hỏi người dùng trước; nếu phải sửa thẳng `draft_info.json` thì yêu cầu tắt CapCut và sao lưu thư mục dự án trước.

## Lỗi hay gặp
| Hiện tượng | Xử lý |
|---|---|
| Không thấy dự án | Tắt hẳn CapCut, mở lại |
| Dự án rỗng | Server lỗi bảng mã; script đã bật UTF-8. Xem `output/vectcut_server.log` |
| `motion word ... is not spoken inside the scene` | Chữ `word` không nằm trong cảnh đó: đổi chữ khác trong câu của cảnh |
| CapCut báo lỗi khi mở | CapCut đã tự cập nhật: quay về bản đã test (9.3 Windows, 9.5 Mac) |
| Phụ đề lỗi font | Cài font Nunito |
