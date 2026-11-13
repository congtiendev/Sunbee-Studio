# Mốc thời gian và storyboard

Trả lời bằng tiếng Việt. Lệnh Python theo máy: Windows `python`, Mac `python3`.

## 1. Mốc thời gian (wav2vec2 trên máy, không API)
```bash
.venv/Scripts/python.exe tools/transcribe.py projects/<video>/voice.mp3 --script projects/<video>/script.txt
```
- Chạy model wav2vec2 tiếng Việt trên máy (`tools/asr_vi.py`, ~15 giây cho 3 phút; dùng lại `voice.w2v.json` nếu đã có), rồi khớp từng chữ với kịch bản.
- **Đạt khi** in `Sentences: N aligned, 0 unmatched`. Có câu unmatched: voice đọc khác kịch bản ở câu đó → sửa `script.txt` cho khớp lời đọc.
- Ra `voice.timing.json` (giờ từng chữ, chuẩn ±0,05 giây) và `voice.srt` (phụ đề lấy chữ đúng từ kịch bản).
- (`--api` dùng Whisper qua API: không còn trong quy trình chuẩn.)

## 2. Chọn bộ nhân vật
Đọc `characters/*/characters.json` và `characters/characters.json`. Một video chỉ dùng **một bộ** (một phong cách).

| Bộ | `--cast` | Nhân vật |
|---|---|---|
| Pastel | `characters/characters.json` | `narrator` (biến thể `narrator:surprised`, `:happy`, `:crying`, `:nervous`, `:tired`, `:pointing`, `:determined`, `:shocked`, `:thinking`), `caveman` |
| Nét đỏ | `characters/net-do/characters.json` | `girl`, `caveman` |

Bộ mới có thể đã được thêm: luôn đọc thư mục `characters/` thay vì tin bảng này.

## 3. Viết `projects/<video>/storyboard.json`
Danh sách cảnh theo thứ tự:
```json
[
  {"at": "Bạn có để ý không", "characters": ["girl"],
   "prompt": "The narrator stands by an open window on a cold windy day, hugging herself and shivering...",
   "sfx": [{"sound": "cold_wind"}]},
  {"at": "Đó là nổi da gà", "characters": ["girl"],
   "prompt": "The narrator on the left narrows her eyes like a detective...",
   "motion": {"type": "cut_in", "word": "thủ phạm", "focus": [0, 0]}}
]
```
- `at`: mấy chữ đầu của cảnh, **đúng chữ trong kịch bản**; cảnh có thể bắt đầu giữa câu.
- `characters`: mã nhân vật trong bộ đã chọn. Cảnh không có người thì `[]`, nhưng model hay vẽ bừa người khi không có ảnh tham chiếu: ưu tiên để nhân vật chính trong khung (ví dụ cô ấy cầm vật đó).
- `prompt`: tiếng Anh, chỉ tả hành động, biểu cảm, bối cảnh, bố cục. Không tả lại ngoại hình nhân vật (script tự thêm). Nói rõ ai ở bên trái/phải. Không xin chữ trong ảnh.

### Nhịp cảnh: trung bình ~3 giây, mọi độ dài video (anh chốt 2026-11-03)
- Mở đầu cắt nhanh 2–3 giây/cảnh; đoạn giải thích 4–8 giây; câu chốt hoặc bất ngờ đổi cảnh đúng lúc, có thể 1–2 giây. Trung bình ra ~3 giây (so-bong-toi: 3,1 giây).
- Khoảng 18–20 cảnh cho 1 phút; ~130 cảnh cho 8 phút; **~400 cảnh cho 20 phút** (vẫn nhịp này, không kéo dài cảnh cho đỡ ảnh).
- Được dùng lại ảnh cũ (`"reuse": NN`) khi hình thật sự lặp lại (cùng nền, cùng tư thế), không bắt buộc.

### Chuyển động: không dùng keyframe (anh chốt 2026-11-03)
Ảnh đứng yên, cắt thẳng, giống video mẫu Ink Explainer. Không ghi `motion` trong storyboard. (Cách cũ kiểu podcast vẫn còn: ghi `motion` rồi dựng với `--motion`, chỉ dùng khi người dùng yêu cầu.)

### Hiệu ứng âm thanh: không dùng (anh chốt 2026-11-03)
Video chỉ có voice + ảnh + phụ đề. Không ghi `sfx`/`cut_sfx` trong storyboard. (Cơ chế âm theo nhát cắt vẫn còn trong `build_capcut.py --sfx`, chỉ bật khi người dùng yêu cầu; thư viện 3 âm ở `sfx/`.)

Không dùng chuyển cảnh (người dùng đã bỏ vì không mượt).

## 4. Tính giờ cảnh
```bash
python tools/scenes.py plan projects/<video> --cast <file characters.json của bộ>
```
Báo số cảnh, cảnh ngắn nhất/dài nhất. Đã có `scenes.json` mà muốn làm lại thì thêm `--force` (mất prompt cũ trong scenes.json; storyboard.json vẫn còn).

## Xong khi
Có `scenes.json`. Cho người dùng xem danh sách cảnh (giờ, câu thoại, chuyển động, âm thanh) dạng bảng ngắn. Bước tiếp: `buoc/4a-anh-flow.md`.
