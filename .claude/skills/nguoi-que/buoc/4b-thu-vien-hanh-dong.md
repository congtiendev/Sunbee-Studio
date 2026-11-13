# Thư viện hành động nhân vật (sprite, dùng ChatGPT thủ công)

Trả lời bằng tiếng Việt. Khác hẳn ảnh cảnh bằng Flow (`buoc/4a-anh-flow.md`): đây là **ảnh nhân vật rời, nền trong suốt thật**, tạo **một lần cho mỗi (nhân vật, hành động, hướng)** rồi **dùng lại cho mọi cảnh/mọi video** cần đúng hành động đó — không gọi API, không tự động hoá trình duyệt, người dùng tự dán prompt vào ChatGPT (gói đã trả theo tháng, không tốn credit riêng).

## Khi nào dùng
Khi cảnh cần nhân vật **chuyển động** (chạy, vẫy tay, chỉ tay…) để ghép làm lớp animation đè lên nền, thay vì 1 ảnh đứng yên gộp chung nền+nhân vật.

## 1. Gắn hành động + hướng vào cảnh
Trong `storyboard.json`/`scenes.json`, mỗi cảnh cần nhân vật chuyển động thêm 2 trường bên cạnh `characters`:
```json
{"characters": ["ban"], "action": "run", "direction": "down", "prompt": "", ...}
```
- `action`: tên hành động ngắn, dùng **nhất quán** (vd luôn "run", không đổi thành "chay"/"running") để thư viện nhận ra là cùng 1 hành động.
- `direction` (tuỳ chọn): `down`/`left`/`right`/`up` cho hành động có hướng (chạy, đi…); bỏ trống cho hành động không phân hướng (vẫy tay, gật đầu…).

## 2. Xem còn thiếu hành động nào
```bash
python tools/action_prompts.py projects/<video>
```
Quét từng cảnh × từng nhân vật trong cảnh, so với thư viện đã có trong `characters/<bo>/characters.json` (`actions`), chỉ xuất prompt cho phần **còn thiếu** → `projects/<video>/_action_prompts.txt`. Có sẵn rồi thì báo "dùng lại", không xuất prompt mới.

## 3. Tạo ảnh bằng ChatGPT (người dùng tự làm)
Với mỗi khối trong `_action_prompts.txt`:
1. Mở ChatGPT, đính kèm đúng (các) ảnh ghi ở dòng "Đính kèm ảnh".
2. Dán nguyên văn phần "PROMPT" vào ChatGPT, gửi.
3. Tải ảnh kết quả về máy (1 ảnh chứa 8 khung xếp ngang 1 hàng, nền trong suốt thật).

Hướng `left`/`right`/`up` nên tạo **sau** hướng `down` cùng hành động — khi đó `action_prompts.py` tự đính kèm thêm sheet `down` đã duyệt làm ảnh tham chiếu thứ 2 để giữ đúng tỉ lệ/trang phục giữa các hướng.

## 4. Đăng ký vào thư viện
```bash
python tools/register_action.py characters/<bo>/characters.json <nhân_vật> <action> <direction> <đường_dẫn_ảnh_vừa_tải>
```
Tự cắt 8 frame (`characters/<bo>/actions/<action>/<direction>/frame_0..7.png`) và ghi vào `characters.json` — từ nay mọi video dùng bộ nhân vật này đều thấy hành động này có sẵn.

Ảnh ChatGPT trả về không đúng bố cục ngang 1 hàng 8 ô: thêm `--cols`/`--rows` cho đúng lưới thật (tích phải bằng 8).
Ảnh nền không trong suốt thật (vd lỡ dùng nguồn khác): thêm `--chroma` để xoá nền kiểu chroma-key (nền phải là màu lục phẳng, xem logic trong `register_action.py`).

## 5. Duyệt lại thư viện
```bash
python tools/action_preview.py characters/<bo>/characters.json
```
Ra `characters/<bo>/action_preview.html` — mở bằng trình duyệt, xem từng hành động/hướng có đủ 8 frame đúng không, animation có mượt không. **Điểm duyệt:** gửi file này cho người dùng trước khi dùng để dựng CapCut.

## Lưu ý
- Thư viện gắn với **bộ nhân vật** (`characters/<bo>/`), không gắn với từng video — tạo 1 lần, dùng mãi.
- Chưa có bước ghép animation này vào CapCut (`build_capcut.py` hiện chỉ ghép 1 ảnh tĩnh/cảnh) — làm riêng khi cần.
