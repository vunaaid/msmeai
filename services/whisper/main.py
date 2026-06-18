"""
vSME Whisper service — bóc nội dung audio → text bằng faster-whisper.

Service Python độc lập (FastAPI), được Express API (apps/api/src/lib/transcribe.ts)
gọi nội bộ qua HTTP. Mặc định cổng 8001.

Hỗ trợ ghi âm dài (1-2h): Express cắt audio thành các đoạn (chunk) bằng ffmpeg rồi
gọi /transcribe cho từng đoạn → cập nhật transcript dần (progressive) + chịu lỗi tốt.
Một instance model dùng toàn bộ CPU core qua cpu_threads nên chạy chunk tuần tự là
nhanh & ổn định nhất trên máy CPU-only.

Chạy dev:   uvicorn main:app --host 0.0.0.0 --port 8001
Chạy PM2:   pm2 start ecosystem.config.js --only vsme-whisper

Biến môi trường:
  WHISPER_MODEL    — tiny|base|small|medium|large-v3 (mặc định "small" — cân bằng cho CPU)
  WHISPER_DEVICE   — "cpu" | "cuda" (mặc định "cpu")
  WHISPER_COMPUTE  — "int8" (cpu) | "float16" (gpu) (mặc định "int8")
  WHISPER_LANGUAGE — ngôn ngữ mặc định (mặc định "vi")
  WHISPER_THREADS  — số CPU thread cho 1 lần transcribe (mặc định = số core)
  WHISPER_BEAM     — beam size (mặc định 1 — nhanh, hợp audio dài)
  TTS_VOICE        — giọng edge-tts mặc định (mặc định "vi-VN-HoaiMyNeural")

Ngoài /transcribe, service còn cung cấp /tts (đọc văn bản → mp3 bằng edge-tts —
dịch vụ online của Microsoft, cần internet).
"""
import io
import os
import tempfile

import edge_tts
import pytesseract
from PIL import Image, ImageOps
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Body
from fastapi.responses import Response
from faster_whisper import WhisperModel

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")
DEFAULT_LANG = os.getenv("WHISPER_LANGUAGE", "vi")
THREADS = int(os.getenv("WHISPER_THREADS", str(os.cpu_count() or 4)))
BEAM = int(os.getenv("WHISPER_BEAM", "1"))

# edge-tts: đọc văn bản → mp3 (giọng tiếng Việt mặc định). Cần internet.
TTS_VOICE = os.getenv("TTS_VOICE", "vi-VN-HoaiMyNeural")
TTS_MAX_CHARS = int(os.getenv("TTS_MAX_CHARS", "8000"))

# OCR: ảnh → text bằng Tesseract (offline). vie+eng cho hóa đơn/ghi chú tiếng Việt.
OCR_LANG = os.getenv("OCR_LANG", "vie+eng")

app = FastAPI(title="vSME Whisper", version="1.2.0")

# Tải model 1 lần khi khởi động (giữ trong RAM). cpu_threads → tận dụng nhiều core.
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE, cpu_threads=THREADS)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE, "device": DEVICE, "threads": THREADS}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form(DEFAULT_LANG)):
    suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    try:
        with tempfile.NamedTemporaryFile(delete=True, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp.flush()
            segments, info = model.transcribe(
                tmp.name,
                language=language or DEFAULT_LANG,
                beam_size=BEAM,
                vad_filter=True,             # lọc khoảng lặng → nhanh & sạch hơn
                condition_on_previous_text=False,  # ổn định hơn cho audio dài
            )
            text = " ".join(seg.text.strip() for seg in segments).strip()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Transcribe failed: {exc}") from exc

    return {
        "text": text,
        "language": info.language,
        "duration": round(info.duration or 0, 2),
    }


@app.post("/tts")
async def tts(payload: dict = Body(...)):
    """Đọc văn bản tiếng Việt → audio mp3 bằng edge-tts. Trả về audio/mpeg."""
    text = (payload.get("text") or "").strip()[:TTS_MAX_CHARS]
    voice = (payload.get("voice") or TTS_VOICE).strip() or TTS_VOICE
    if not text:
        raise HTTPException(status_code=400, detail="Thiếu nội dung văn bản")
    try:
        communicate = edge_tts.Communicate(text, voice)
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"TTS failed: {exc}") from exc
    if not audio:
        raise HTTPException(status_code=500, detail="TTS không tạo được audio")
    return Response(content=bytes(audio), media_type="audio/mpeg")


@app.get("/tts/voices")
def tts_voices():
    """Một vài giọng tiếng Việt hỗ trợ (tham khảo)."""
    return {
        "default": TTS_VOICE,
        "voices": ["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"],
    }


@app.post("/ocr")
async def ocr(file: UploadFile = File(...), language: str = Form(OCR_LANG)):
    """Trích xuất text từ ảnh (Tesseract). Trả về {text}."""
    try:
        raw = await file.read()
        image = Image.open(io.BytesIO(raw))
        # EXIF orientation (ảnh chụp điện thoại) + grayscale → OCR ổn định hơn.
        image = ImageOps.exif_transpose(image)
        image = ImageOps.grayscale(image)
        text = pytesseract.image_to_string(image, lang=language or OCR_LANG)
    except pytesseract.TesseractNotFoundError as exc:
        raise HTTPException(status_code=500, detail="Chưa cài Tesseract OCR trên máy chủ") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}") from exc

    # Gom khoảng trắng thừa nhưng giữ xuống dòng.
    lines = [ln.strip() for ln in text.splitlines()]
    cleaned = "\n".join(ln for ln in lines if ln)
    return {"text": cleaned, "language": language or OCR_LANG}
