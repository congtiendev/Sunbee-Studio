# Catalog giọng có sẵn (preset)

Danh sách "Giọng có sẵn" trên trang Library gồm **hai nguồn gộp lại**:

1. **VieNeu-TTS built-in** (`../vieneu-presets.ts`) — 25 giọng tiếng Việt có sẵn trong model
   VieNeu-TTS v3 Turbo (github.com/pnnbao97/VieNeu-TTS, Apache-2.0 cho cả code và weight). Không
   tải riêng từng giọng — cả model tải một lần duy nhất qua gói `vieneu` lúc dùng lần đầu, "cài"
   một giọng ở đây chỉ là tạo một `VoiceProfile` trỏ tới tên giọng đó. Không cần sửa gì ở đây để
   dùng các giọng này.
2. **`manifest.json`** dưới đây — giọng clone từ mẫu ghi âm của riêng bạn, ship rỗng (`[]`) vì
   không thể tự xác minh quyền sử dụng của bất kỳ bản ghi âm nào để nhúng sẵn. Tự thêm entry khi
   bạn đã có mẫu giọng mà mình có quyền dùng.

## Format mỗi entry

```json
{
  "id": "nguyen-van-a",
  "name": "Nguyễn Văn A — giọng kể chuyện",
  "language": "vi",
  "gender": "male",
  "description": "Giọng nam trầm, phù hợp video kiến thức",
  "samplePath": "nguyen-van-a.wav",
  "mime": "audio/wav"
}
```

- `id`: duy nhất, dùng để chống cài trùng (idempotent install).
- `samplePath`: tên file đặt trong `presets/samples/` (ưu tiên — không phụ thuộc mạng).
- `sampleUrl`: thay cho `samplePath` nếu muốn tải từ một URL khi cài, thay vì nhúng file local.
  Chỉ dùng URL bạn chắc là ổn định và có quyền dùng lại nội dung.
- `mime`: kiểu file mẫu (`audio/wav`, `audio/mpeg`, ...).

## Trước khi thêm một entry

Kiểm tra bạn có quyền dùng bản ghi âm đó cho việc clone giọng (bản ghi của chính bạn, hoặc nguồn
ghi rõ license cho phép) — đừng nhúng giọng của người khác mà không có sự đồng ý.
