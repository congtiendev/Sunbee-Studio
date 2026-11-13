# Kịch bản và voice

Trả lời bằng tiếng Việt, ngắn gọn. Lệnh Python theo máy: Windows `python`, Mac `python3` (xem `buoc/0-cai-dat.md`).

## 1. Thư mục video
Mỗi video là `projects/<ten-khong-dau>/`, ví dụ `projects/vi-sao-noi-da-ga/`. Hỏi tên nếu người dùng chưa đặt.

## 2. Kịch bản `script.txt` (bắt buộc, kể cả voice thật)
- Mỗi dòng một câu hoặc một ý. UTF-8. Đúng chính tả, vì phụ đề lấy chữ từ đây.
- Nếu Claude viết kịch bản: câu ngắn, giọng kể chuyện, có câu mở gây tò mò, có câu chốt cuối. Độ dài theo giọng MiniMax: **khoảng 1.000 ký tự cho 1 phút**.
- Cho người dùng duyệt kịch bản trước khi tạo voice.

## 3. Chọn cách làm voice

### A. Voice thật
Người dùng thu đúng theo kịch bản, lưu `voice.m4a` / `voice.mp3` / `voice.wav` trong thư mục video. Mẹo: thu chỗ yên tĩnh, ngắt hơi rõ giữa các câu. **Vấp thì cứ dừng 1–2 giây rồi đọc lại cả câu**, Claude sẽ cắt lần hỏng.

**Bản thu có vấp, đọc lại, ngập ngừng** → làm sạch trước khi sang bước 2:
**Không dùng Whisper để tìm chỗ vấp**: Whisper cố ý viết câu gọn nên giấu các lần đọc lặp (video so-bong-toi: Whisper thấy 6 chỗ, thực tế 12 chỗ).
1. Lưu bản gốc là `voice_goc.m4a`. Chạy model tiếng Việt trên máy (miễn phí, không gọi API):
   `.venv/Scripts/python.exe tools/asr_vi.py projects/<video>/voice_goc.m4a` → mỗi dòng một cụm `[giây] chữ…`, lưu `voice_goc.w2v.json` (mốc giờ từng chữ, chuẩn ±0,05 giây). Chữ sai chính tả nhẹ là bình thường; cần đọc rõ hơn thì chạy thêm `… zip` (Zipformer, chính tả tốt hơn, nhưng mốc giờ sớm ~0,3 giây nên không dùng để cắt).
2. So với `script.txt`, tìm: cụm đọc 2–4 lần liền nhau (giữ **lần cuối đọc trọn và đúng kịch bản**), câu bỏ dở, chữ vấp. Ad-lib hay (người dùng tự thêm cho hay) thì giữ và báo lại.
3. Cắt: `python tools/clean_voice.py projects/<video>/voice_goc.m4a --words projects/<video>/voice_goc.w2v.json --cut A-B --cut C-D` (A = giờ kết thúc chữ cuối giữ lại, B = giờ bắt đầu chữ tiếp theo giữ lại, lấy từ file w2v). Script bám khoảng lặng thật để không lẹm chữ, chỉ rút khoảng lặng thật dài (đo bằng mức âm) xuống 0,6 giây, ra `voice.mp3` và `voice.cuts.json`.
4. Kiểm tra: chạy lại `asr_vi.py voice.mp3`, mỗi câu kịch bản chỉ được xuất hiện một lần, không còn mẩu chữ thừa. Gửi `voice.mp3` cho người dùng nghe lại.
5. Sau đó bước lấy mốc giờ (`buoc/3-chia-canh.md`) dùng lại luôn kết quả wav2vec2 của `voice.mp3`.
Lưu ý giấy phép: hai model trong `models/` là CC-BY-NC (phi thương mại). Báo người dùng nếu kênh có kiếm tiền.

### B. Tách tiếng từ video có sẵn
`ffmpeg -i <video> -vn -c:a aac projects/<video>/voice.m4a`. Không có kịch bản: chạy `asr_vi.py voice.m4a zip` (chính tả tốt hơn) để có lời, Claude thêm dấu câu, người dùng sửa chính tả thành `script.txt`.

Không dùng voice AI (cần API trả phí; anh bỏ ShopAIKey 2026-11-03).

## Xong khi
Thư mục video có `script.txt` và một file `voice.*`. Bước tiếp theo: `buoc/3-chia-canh.md`.
