"""Local TTS sidecar — spawned by server/services/voice/engine-process.ts.

Prints "PORT=<n>" to stdout once bound, so the Node side (which starts this
with --port 0) knows where to send requests without a fixed port number.
"""

import argparse
import asyncio
import socket

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from engine import is_ready, synthesize_wav, warm, warm_error
from separation import separate_vocals_wav

app = FastAPI()


@app.on_event("startup")
async def _warm_on_startup() -> None:
    # Loads the model now (can take minutes on a cold cache: pip-installed
    # package downloads its weights from Hugging Face on first run) instead
    # of on whoever's first "nghe thử" click. Runs in a thread so /health
    # keeps answering (with ready=false) while this is in progress.
    asyncio.create_task(asyncio.to_thread(warm))


class SynthesizeRequest(BaseModel):
    text: str
    sample_path: str | None = None
    preset_voice_id: str | None = None
    language: str = "vi"


class SeparateRequest(BaseModel):
    song_path: str


@app.get("/health")
def health():
    return {"ok": True, "ready": is_ready(), "error": warm_error()}


@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    try:
        wav_bytes = synthesize_wav(req.text, req.sample_path, req.preset_voice_id, req.language)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    return Response(content=wav_bytes, media_type="audio/wav")


@app.post("/separate-vocals")
def separate_vocals(req: SeparateRequest):
    try:
        wav_bytes = separate_vocals_wav(req.song_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    return Response(content=wav_bytes, media_type="audio/wav")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    port = args.port or free_port()
    print(f"PORT={port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
