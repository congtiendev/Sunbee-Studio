# Sunbee Studio

Ứng dụng hỗ trợ sản xuất video bằng AI: lấy kịch bản/transcript từ link video hoặc file tải lên, trích khung hình, phân tích kịch bản bằng OpenAI/Claude, quản lý theo Dự án → Danh mục → Video.

**Stack:** React 19 + Vite + TypeScript + Tailwind CSS v4 (frontend) · Express + SQLite (`better-sqlite3`) (backend) · Electron (đóng gói app desktop cho Windows/Linux).

Chạy được theo 2 cách: **web app** (`npm run dev`, mở bằng trình duyệt) hoặc **app desktop** (`npm run dev:electron`).

## Yêu cầu hệ thống

- Node.js **20.19+** hoặc **22.12+**
- npm (đi kèm Node)
- Git

> **Chỉ code/test bằng trình duyệt (`npm run dev`) thì không cần gì thêm** — bản dựng sẵn (prebuilt) của `better-sqlite3` cho Node là đủ, không cần cài C++ compiler.
>
> **Chỉ khi nào cần chạy/đóng gói app desktop** (`npm run dev:electron`, `npm run package:win`) thì mới có thể cần [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (workload **"Desktop development with C++"**, ~4-7GB) — vì Electron dùng ABI riêng, không phải lúc nào cũng có bản dựng sẵn khớp. Không có cách nào nhẹ hơn để tự biên dịch native module trên Windows, nên chỉ cài khi thực sự cần đến Electron — xem mục "Khắc phục sự cố".

### Công cụ dòng lệnh bắt buộc cho tính năng video

Tính năng "Lấy kịch bản từ link video", "Tải video lên" và trích khung hình cần 3 công cụ sau có sẵn trong `PATH`:

| Công cụ | Dùng để |
| --- | --- |
| **yt-dlp** | Tải phụ đề/video từ YouTube và các trang khác |
| **ffmpeg** | Trích khung hình từ video |
| **Deno** (hoặc Node ≥ 22) | yt-dlp cần để giải JS challenge khi YouTube chặn bot |

Thiếu các công cụ này, app vẫn chạy bình thường, chỉ riêng 2 tính năng trên sẽ báo lỗi. Chế độ "Dán kịch bản trực tiếp" không cần gì trong số này.

## Cài đặt công cụ bên ngoài

### Windows

```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
winget install DenoLand.Deno
```

Không có `winget`, dùng [Chocolatey](https://chocolatey.org/):

```powershell
choco install yt-dlp ffmpeg deno
```

Sau khi cài, **mở terminal mới** (PATH chỉ cập nhật cho phiên mới) rồi kiểm tra:

```powershell
yt-dlp --version
ffmpeg -version
deno --version
```

### Linux (Ubuntu/Debian)

```bash
# ffmpeg
sudo apt update && sudo apt install -y ffmpeg

# yt-dlp — nên cài bản standalone mới nhất, KHÔNG dùng "apt install yt-dlp" (thường quá cũ)
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Deno
curl -fsSL https://deno.land/install.sh | sh
# Thêm dòng in ra ở cuối (thường export PATH="$HOME/.deno/bin:$PATH") vào ~/.bashrc hoặc ~/.zshrc, rồi mở lại terminal
```

> yt-dlp cập nhật khá thường xuyên vì YouTube hay đổi cơ chế chống bot. Nếu gặp lỗi kiểu "Requested format is not available", chạy lại lệnh tải bản standalone ở trên để cập nhật (hoặc `yt-dlp -U` nếu cài qua cách khác).

## Cài đặt & chạy dự án

```bash
git clone https://github.com/congtiendev/Sunbee-Editor.git
cd Sunbee-Editor
npm install
npm run dev
```

Mặc định: frontend (Vite) chạy ở `http://localhost:5173`, backend (Express) ở cổng `4317` — Vite tự proxy API sang backend, chỉ cần mở `http://localhost:5173`.

File `.env` là **tuỳ chọn**, chỉ cần nếu muốn đổi cổng/đường dẫn dữ liệu mặc định:

```bash
cp .env.example .env      # Windows PowerShell: copy .env.example .env
```

### Chạy dưới dạng app desktop (Electron) khi dev

```bash
npm run dev:electron
```

### Đăng ký tài khoản đầu tiên

Chưa có tài khoản dựng sẵn — mở app, bấm **Đăng ký**. **Người đăng ký đầu tiên tự động là admin**, các tài khoản sau là user thường.

## Thiết lập API key AI (OpenAI / Claude)

API key **không** nằm trong `.env` — nhập trực tiếp trong app, được mã hoá và lưu ở `data/settings.json` (thư mục `SUNBEE_DATA_DIR`, mặc định `data/`, đã được gitignore):

1. Đăng nhập vào app.
2. Vào **Cài đặt → API Keys**, dán OpenAI API key và/hoặc Anthropic (Claude) API key.
3. Trong bước Phân tích kịch bản, chọn provider (OpenAI/Claude) và model tương ứng.

## Các lệnh

| Lệnh | Mục đích |
| --- | --- |
| `npm run dev` | Chạy Vite + Express song song (web dev) |
| `npm run dev:server` | Chỉ chạy backend Express (`tsx watch`) |
| `npm run dev:electron` | Chạy backend + Electron (desktop dev) |
| `npm run build` | Type-check + build frontend, backend, Electron |
| `npm run lint` | Oxlint + ESLint (`lint:fast` chỉ chạy Oxlint) |
| `npm run lint:fix` | Tự sửa lỗi bằng Oxlint rồi ESLint |
| `npm run format` | Format toàn bộ repo bằng Prettier |
| `npm run package:win` | Build + đóng gói bộ cài Windows (`.exe`) |
| `npm run package:linux` | Build + đóng gói AppImage/`.deb` cho Linux |

## Code trên cả Windows lẫn Linux, build app Windows

**Code (`npm run dev`)**: chạy tốt trên cả 2 hệ điều hành, không có gì đặc biệt — chỉ cần làm theo phần "Cài đặt & chạy dự án" ở trên trên từng máy.

**Build bộ cài Windows (`npm run package:win`)**: có 2 cách, mức độ tin cậy khác nhau vì app có native module `better-sqlite3`:

1. **Build trực tiếp trên máy Windows (khuyên dùng, chắc chắn chạy được)** — chỉ cần cài Visual Studio Build Tools nếu `better-sqlite3` không có bản dựng sẵn khớp (xem mục "Khắc phục sự cố"), rồi chạy `npm run package:win` ngay trên Windows.
2. **Build từ Linux (cross-build)** — `electron-builder` *có hỗ trợ* dựng bộ cài Windows từ Linux (dùng Docker image `electronuserland/builder:wine`, hoặc cài Wine cục bộ), **nhưng chỉ chạy được nếu `better-sqlite3` có sẵn bản dựng sẵn (prebuilt) đúng khớp ABI của Electron đang dùng cho Windows x64** — vì không thể biên dịch native module C++ cho Windows từ Linux (không có MSVC toolchain cross-platform). Nếu không có bản sẵn khớp, build sẽ lỗi thẳng và không có cách khắc phục nào khác ngoài build trên Windows thật (hoặc máy ảo/CI Windows, ví dụ GitHub Actions `windows-latest`).

→ Nếu cần build Windows thường xuyên và ổn định, nên có sẵn một máy/VM Windows (hoặc dùng CI) thay vì phụ thuộc cross-build từ Linux.

## Khắc phục sự cố thường gặp

| Vấn đề | Cách xử lý |
| --- | --- |
| `yt-dlp`/`ffmpeg`: command not found | Chưa cài hoặc chưa có trong `PATH` — xem lại mục "Cài đặt công cụ bên ngoài", mở terminal mới sau khi cài |
| Lỗi "Requested format is not available" / "No supported JavaScript runtime" khi lấy kịch bản từ link | yt-dlp cần Deno (hoặc Node ≥ 22) trong `PATH` để giải JS challenge của YouTube — cài Deno rồi khởi động lại `npm run dev` |
| `npm install` hoặc `npm run dev:electron` báo lỗi cần MSBuild/Visual Studio/C++ khi build `better-sqlite3` | `better-sqlite3` ưu tiên tải bản dựng sẵn; chỉ khi không có bản sẵn khớp đúng Node/Electron ABI mới tự biên dịch (cần C++). App Electron còn có bước rebuild riêng cho ABI của Electron (`npmRebuild: true`), nên dù `npm install` qua được, bước chạy/đóng gói Electron vẫn có thể cần build lại. Cách xử lý: cài [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) với workload **"Desktop development with C++"**, rồi chạy lại lệnh bị lỗi |
| Mất API key sau khi xoá thư mục `data/` | Key lưu trong `data/settings.json`, xoá thư mục này sẽ mất toàn bộ tài khoản/dữ liệu cục bộ — sao lưu trước nếu cần |
