---
name: nguoi-que
description: 'Skill Người Que — làm trọn video kiến thức người que từ ý tưởng đến dự án CapCut, không dùng API trả phí: cài máy, tạo bộ nhân vật, kịch bản + voice thu thật (cắt vấp bằng model trên máy), mốc giờ, storyboard + asset nhịp 3 giây, ảnh bằng Google Flow qua Chrome, dựng CapCut (ảnh đứng yên, phụ đề). Làm được video 20 phút trong 1 ngày. Dùng khi người dùng gõ /nguoi-que, nói "skill người que", "làm video người que", "làm video về ...", hoặc muốn làm/sửa riêng một bước (cài đặt, nhân vật, voice, chia cảnh, ảnh, CapCut).'
---

# Skill Người Que: làm video từ A đến Z

**Thư mục làm việc**: mọi đường dẫn tương đối trong skill này (`characters/`, `tools/`, `vendor/`, `models/`, `projects/`, `NHAT_KY_QUY_TRINH.md`...) tính từ `nguoi-que-workspace/` ở gốc repo — luôn `cd nguoi-que-workspace` trước khi chạy bất kỳ lệnh nào của skill.

Một skill duy nhất. Hướng dẫn chi tiết từng bước nằm trong `.claude/skills/nguoi-que/buoc/`: **đọc đúng file bước khi tới bước đó** (không đọc hết từ đầu cho đỡ token):
| File | Bước |
|---|---|
| `buoc/0-cai-dat.md` | Cài máy lần đầu, kiểm tra thiếu gì |
| `buoc/1-nhan-vat.md` | Tạo bộ nhân vật gốc (khi chưa có) |
| `buoc/2-voice.md` | Kịch bản, voice thật (cắt vấp) |
| `buoc/3-chia-canh.md` | Mốc giờ, asset, storyboard, nhịp 3 giây |
| `buoc/4a-anh-flow.md` | Ảnh một cảnh bằng Google Flow, giới hạn an toàn |
| `buoc/4b-thu-vien-hanh-dong.md` | Thư viện hành động nhân vật tái sử dụng, ChatGPT thủ công |
| `buoc/5-capcut.md` | Dựng và sửa dự án CapCut |
Người dùng gọi riêng một bước được, ví dụ "/nguoi-que cài đặt", "/nguoi-que làm lại ảnh cảnh 12", "/nguoi-que dựng lại CapCut": đọc file bước đó và làm, không chạy lại từ đầu.

Claude là người biên đạo: tự quyết chi tiết kỹ thuật, chỉ dừng ở các **điểm duyệt**. Trả lời tiếng Việt, ngắn, không giả định người dùng biết lập trình. Sau mỗi bước báo một dòng: xong gì, mất bao lâu, tốn bao nhiêu. **Mỗi lựa chọn của người dùng ghi một dòng vào `NHAT_KY_QUY_TRINH.md`.** Lần đầu trên máy mới: chạy `buoc/0-cai-dat.md`.

## 0. Hỏi một lần lúc đầu (gộp một câu hỏi)
- Chủ đề hoặc kịch bản có sẵn? Độ dài?
- Voice: thu thật (khuyên dùng) hay AI (giọng nữ kênh, gợi ý `--voice nam`)?
- Bộ nhân vật: liệt kê các bộ trong `characters/`; chưa có bộ hợp → `buoc/1-nhan-vat.md`.
- Tên thư mục `projects/<ten-khong-dau>`.

## 1. Kịch bản và voice → `buoc/2-voice.md`
- Claude viết kịch bản → **Điểm duyệt 1**.
- Voice thu thật: người dùng vấp thì dừng 1–2 giây đọc lại cả câu. Claude tìm chỗ vấp bằng wav2vec2 (`asr_vi.py`), cắt bằng `clean_voice.py`, gửi bản sạch nghe lại. Sửa `script.txt` theo đúng lời đọc (giữ `script_goc.txt`).

## 2–3. Mốc giờ, asset, storyboard → `buoc/3-chia-canh.md`
- Mốc giờ bằng wav2vec2 trên máy, phải khớp đủ câu.
- `assets.json`: 3–5 nền dùng lại + sự vật/con vật/nhân vật phụ lặp lại.
- `storyboard.json`: một cảnh một ý, mở đầu cắt nhanh, có `background`, `assets`. Không `motion`, không `sfx`.
- Gửi bảng `STORYBOARD.md` (tiếng Việt) → **Điểm duyệt 2**.

## 4. Ảnh
- **Ảnh một cảnh** (nền + nhân vật gộp chung, đứng yên) → `buoc/4a-anh-flow.md` (Google Flow): tạo asset trước → gửi bảng asset → **Điểm duyệt 3**. Tạo cảnh theo lượt (≤ 10 việc/lượt), chọn ảnh tốt hơn mỗi cặp, làm lại cảnh lỗi (tối đa 2 lần). Gửi `review_sheet.jpg` → **Điểm duyệt 4**.
- **Thư viện hành động nhân vật** (8 frame PNG nền trong suốt thật, tạo 1 lần/hành động dùng lại mãi — khi cảnh cần nhân vật chuyển động, không phải 1 ảnh đứng yên) → `buoc/4b-thu-vien-hanh-dong.md`: ChatGPT thủ công, không qua Flow/API. `tools/action_prompts.py` xuất prompt còn thiếu theo từng cảnh × nhân vật → người dùng tự dán vào ChatGPT → `tools/register_action.py` cắt 8 frame + lưu vào thư viện → `tools/action_preview.py` ra trang duyệt.

## 5. CapCut → `buoc/5-capcut.md`
`build_capcut.py`: voice + ảnh đứng yên + phụ đề. Kiểm tra `draft_info.json`. Gửi mã dự án, nhắc tắt hẳn rồi mở lại CapCut → **Điểm duyệt 5**. Không tự xoá bản nháp cũ.
Người dùng tự làm trong CapCut: nhạc nền, intro/outro, xuất 1080p.

## Video dài: 20 phút xong trong 1 ngày (anh chốt 2026-11-03)
Giữ **nhịp ~3 giây** như mọi video (`buoc/3-chia-canh.md`), chia kịch bản (~15.000–17.000 ký tự) thành **6–8 chương**.
- 20 phút ≈ **400 cảnh**; cộng ~15 asset và ~10% làm lại ≈ **450 lệnh Flow** (900 ảnh).
- Dùng lại ảnh (`"reuse"`) chỉ khi hình thật sự lặp; thẻ chữ (tiêu đề chương, con số) làm trong CapCut.

Lịch "chạy chậm vừa" (đo từ so-bong-toi: ~60 lệnh / 25 phút kể cả chọn ảnh), tổng **≈ 8,5–9 giờ**:
| Khâu | Thời gian | Ghi chú |
|---|---|---|
| Kịch bản theo chương → anh duyệt | ~45 phút | Điểm duyệt |
| Anh thu voice 20 phút (vấp đọc lại) → Claude cắt vấp, lấy mốc giờ | ~1,5 giờ | Nghe lại voice sạch |
| Asset cả video + storyboard chương 1–2 | ~45 phút | Duyệt asset, storyboard |
| Flow: **8 phiên × ~60 lệnh**, mỗi phiên ~25 phút + nghỉ 15 phút | ~5 giờ | Lúc nghỉ: Claude viết storyboard chương sau, chọn ảnh chương trước; anh duyệt theo chương |
| Làm lại cảnh lỗi, dựng CapCut, anh kiểm tra | ~45 phút | Điểm duyệt cuối |
Token Claude cho phần Flow ước ~1,5–2,5 triệu/video (chưa đo cho video dài).

**Có vấn đề thì báo người dùng ngay, không tự đổi cách làm:** chạm giới hạn/cảnh báo của Flow, hạn mức gói Claude sắp hết, chậm hơn lịch trên, nhiều cảnh hỏng. Nêu rõ: chuyện gì, còn bao nhiêu cảnh, các lựa chọn (chờ, tài khoản PRO thứ hai, tách sang hôm sau). Ghi số đo thật (lệnh, thời gian, token, có bị chặn không) vào NOTES.md và nhật ký để chỉnh lại các con số này.

## Ghi lại
`projects/<video>/NOTES.md`: voice, số câu khớp, số cảnh, ảnh làm lại và lý do, mã dự án CapCut, chi phí/token. Kinh nghiệm mới: thêm vào file bước liên quan trong `buoc/` và `NHAT_KY_QUY_TRINH.md` **một lần khi chốt video** (không cập nhật sau mỗi lần sửa nhỏ, cho nhanh).

## Chuẩn kênh (không tự đổi khi chưa hỏi)
- Phụ đề Nunito đậm cỡ 6, trắng viền đen, `transform_y` -0.82; khung 1920×1080.
- Ảnh đứng yên, cắt thẳng: không keyframe, không chuyển cảnh, không sound effect, không logo.
- **Style ảnh "nét nâu giấy" (chốt theo ảnh mẫu người dùng gửi)**: nét viền nâu đậm hơi bất quy tắc kiểu bút sáp/chì (không vector đen đều), màu phẳng lì dịu, bóng đơn giản, có hạt giấy ấm nhẹ. Hình khối bo tròn, giảm chi tiết nhỏ, silhouette rõ. Nhân vật người: chibi đầu to tròn, thân ngắn gọn (~2,5–3 đầu nếu toàn thân), tay chân nhỏ bo tròn, mắt to biểu cảm — giữ đặc điểm nhận diện riêng (tóc, dáng mặt, kính, trang phục, đạo cụ) của từng nhân vật, không biến mọi nhân vật thành cùng một khuôn mặt. Nền/bối cảnh dùng cùng nét nâu + chất giấy, giữ phối cảnh và các lớp không gian trước/giữa/xa dễ đọc. Tránh: ảnh thật, bóng nhựa 3D, gradient mịn kiểu airbrush, nét anime mảnh, màu neon. Ảnh tham chiếu style cố định: `characters/_style-ref/chibi-style-target.png` (ví dụ đầy đủ người + bối cảnh) và `characters/_style-ref/line-and-paper-reference.png` (nét viền + chất giấy) — đính kèm cả hai khi tạo mọi ảnh (nhân vật, asset, nền) để giữ style đồng nhất; đây chỉ là tham chiếu CÁCH VẼ, không copy người/vật trong 2 ảnh này.
- Chữ trên hình (tiếng Việt) thêm trong CapCut, không để AI vẽ.

## Quy tắc chung
- **Không dùng API trả phí nào** (anh bỏ ShopAIKey 2026-11-03): voice thật, mốc giờ bằng wav2vec2 trên máy, ảnh bằng Google Flow. Không nhập mật khẩu; người dùng tự đăng nhập Google.
- Tải file từ mạng phải liệt kê tên, nguồn, dung lượng cho người dùng duyệt trước.
- Chi phí: 0đ ngoài gói Claude và Google AI Pro; token Claude ~3–6 nghìn/cảnh cho phần Flow.
