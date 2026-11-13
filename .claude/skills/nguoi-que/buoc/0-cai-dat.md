# Cài đặt máy (chỉ làm một lần mỗi máy)

Trả lời người dùng bằng tiếng Việt, ngắn gọn, không giả định họ biết lập trình. Làm từng mục theo thứ tự, mục nào đã có thì báo "đã có" rồi đi tiếp. Cuối cùng in một bảng kiểm tra.

## 1. Nhận diện máy
- Windows: lệnh Python là `python` (hoặc `py -3.11`), Python của dự án là `.venv\Scripts\python.exe`.
- Mac: lệnh Python là `python3`, Python của dự án là `.venv/bin/python`.
Mọi skill khác dùng đúng quy ước này.

## 2. Kiểm tra từng thứ

| Thứ | Cách kiểm tra | Nếu thiếu |
|---|---|---|
| Python 3.11+ | `python --version` / `python3 --version` | Windows: `winget install Python.Python.3.11`. Mac: `brew install python@3.12` |
| ffmpeg, ffprobe | `ffmpeg -version` | Windows: `winget install Gyan.FFmpeg` rồi mở lại cửa sổ lệnh. Mac: `brew install ffmpeg` |
| `.venv` có thư viện | `.venv` tồn tại và `<python .venv> -c "import flask, PIL"` chạy được | Windows: `py -3.11 -m venv .venv` rồi `.venv\Scripts\python.exe -m pip install -r vendor/VectCutAPI/requirements.txt pillow`. Mac: `/opt/homebrew/bin/python3.12 -m venv .venv` rồi `.venv/bin/pip install -r vendor/VectCutAPI/requirements.txt pillow` |
| VectCutAPI | Thư mục `vendor/VectCutAPI` có `capcut_server.py` | Báo người dùng chép lại đủ thư mục dự án |
| CapCut desktop | Windows: thư mục `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft` tồn tại. Mac: `~/Movies/CapCut/User Data/Projects/com.lveditor.draft` | Cài CapCut bản desktop, mở một lần. Nhắc **tắt tự động cập nhật** (đã test bản 9.3 Windows, 9.5 Mac) |
| Nhận giọng tiếng Việt trên máy (**bắt buộc**: cắt vấp, mốc giờ, phụ đề) | `models/wav2vec2-vi/pytorch_model.bin` tồn tại, `<python .venv> -c "import torch, transformers"` chạy được | **Model chuẩn: wav2vec2** (chốt 2026-11-03). Liệt kê dung lượng (~600 MB) và giấy phép CC-BY-NC (phi thương mại) cho người dùng duyệt. Rồi: `pip install torch --index-url https://download.pytorch.org/whl/cpu`, `pip install transformers`; tải `nguyenvulebinh/wav2vec2-base-vietnamese-250h` (`*.json`, `*.txt`, `pytorch_model.bin`) vào `models/wav2vec2-vi` bằng `huggingface_hub.snapshot_download`. Tuỳ chọn, chỉ khi cần đọc chữ rõ hơn: Zipformer (~60 MB, `pip install sherpa-onnx sentencepiece`, tải `hynt/Zipformer-30M-RNNT-6000h` `*.int8.onnx` + `bpe.model` vào `models/zipformer-vi`, tạo `tokens.txt` từ `bpe.model`, mỗi dòng `piece id`) |
| Font Nunito (phụ đề) | Không cần kiểm tra | Không cần cài: Nunito là font có sẵn trong thư viện CapCut, CapCut tự tải khi mở dự án lần đầu (cần mạng) |

## 3. Chrome và Google Flow
- Chrome có tiện ích Claude in Chrome, kết nối với Claude (`list_connected_browsers`).
- Người dùng tự đăng nhập Google Flow bằng tài khoản có **Google AI Pro** (huy hiệu PRO). Không bao giờ hỏi hay nhập mật khẩu.
- Lần đầu chạy bước ảnh Chrome sẽ hỏi quyền "truy cập ứng dụng trên thiết bị" cho flow.google.com: bấm Cho phép.

Quy trình không dùng API trả phí nào, không cần key.

## 4. Kết quả
In bảng: mỗi dòng một thứ, cột "Trạng thái" (Có / Đã cài / Người dùng cần làm). Nếu tất cả đều có, nói: "Máy đã sẵn sàng. Gõ /nguoi-que để làm video đầu tiên."
