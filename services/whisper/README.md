# vSME Whisper service — bóc nội dung audio (speech-to-text)

Service Python độc lập, dùng [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper)
(CTranslate2) để bóc nội dung file ghi âm thành text. Express API
(`apps/api/src/lib/transcribe.ts`) gọi service này qua HTTP nội bộ.

## Cài đặt

Yêu cầu: Python 3.9+ và **ffmpeg** (faster-whisper cần ffmpeg để decode audio).

```bash
sudo apt-get install -y ffmpeg          # nếu chưa có
cd services/whisper
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

Lần chạy đầu sẽ tự tải model (`medium` ~1.5GB) về `~/.cache/huggingface`.

## Chạy

```bash
# Dev
. .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001

# Production (PM2) — đã khai báo process "vsme-whisper" trong ecosystem.config.js
pm2 start ecosystem.config.js --only vsme-whisper
```

## Kiểm tra

```bash
curl -s http://localhost:8001/health
curl -s -F "file=@test.webm" -F "language=vi" http://localhost:8001/transcribe
```

## Cấu hình (env)

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `WHISPER_MODEL` | `medium` | `tiny`/`base`/`small`/`medium`/`large-v3`. Tiếng Việt nên dùng `medium`+ |
| `WHISPER_DEVICE` | `cpu` | `cpu` hoặc `cuda` (cần GPU + CUDA) |
| `WHISPER_COMPUTE` | `int8` | `int8` (CPU) / `float16` (GPU) |
| `WHISPER_LANGUAGE` | `vi` | Ngôn ngữ mặc định |

Phía Express, đặt `WHISPER_API_URL=http://localhost:8001` trong `.env`.

> CPU: model `medium` mất ~vài giây cho mỗi đoạn ghi âm ngắn. Nếu khối lượng lớn,
> cân nhắc GPU (`WHISPER_DEVICE=cuda`, `WHISPER_COMPUTE=float16`, model `large-v3`).
