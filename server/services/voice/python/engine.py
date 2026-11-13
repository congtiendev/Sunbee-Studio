"""Real TTS engine: VieNeu-TTS v3 Turbo (pnnbao97/VieNeu-TTS, Apache-2.0 —
both code and model weights, github.com/pnnbao97/VieNeu-TTS). One engine
covers both:
  - Cloning: `ref_audio=<sample_path>` — instant, from a 3-8s reference clip.
  - Built-in voices: `voice=<name>` — one of the 25 preset voices listed in
    ../vieneu-presets.ts, no sample needed.

Install: add `vieneu` to requirements.txt. The CPU install is torch-free
(runs on ONNX Runtime); the model weights download from Hugging Face on
first use (cached under TORCH_HOME/HF_HOME, see engine-process.ts).
"""

import io
import threading

_lock = threading.Lock()
_vieneu = None
# Set by warm() if loading fails outright (e.g. `vieneu` isn't installed) —
# lets /health report "will never become ready" instead of app.py polling
# it for the full 30-minute startup timeout before giving up.
_warm_error: str | None = None


def _load():
    global _vieneu
    if _vieneu is not None:
        return
    from vieneu import Vieneu  # noqa: PLC0415

    _vieneu = Vieneu()


def is_ready() -> bool:
    return _vieneu is not None


def warm_error() -> str | None:
    return _warm_error


def warm() -> None:
    """Loads the model now instead of on the first request — called once at
    sidecar startup (app.py) so the slow part (first-ever model download +
    load into RAM) happens before any "nghe thử" click, not during one."""
    global _warm_error
    try:
        with _lock:
            _load()
    except Exception as exc:  # noqa: BLE001 - missing `vieneu` etc.
        _warm_error = str(exc)


def synthesize_wav(text: str, sample_path: str | None, preset_voice_id: str | None, language: str) -> bytes:
    try:
        import soundfile as sf  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError(
            "Chưa cài vieneu. Bỏ dấu comment gói vieneu trong "
            f"server/services/voice/python/requirements.txt rồi cài lại venv. ({exc})"
        ) from exc

    if not sample_path and not preset_voice_id:
        raise RuntimeError("Cần sample_path (clone) hoặc preset_voice_id (giọng có sẵn).")

    # The SDK isn't safe for concurrent inference in one process; the
    # sidecar only ever serves one request at a time anyway.
    with _lock:
        _load()
        if sample_path:
            audio = _vieneu.infer(text, ref_audio=sample_path, denoise=True)
        else:
            audio = _vieneu.infer(text, voice=preset_voice_id)
        buffer = io.BytesIO()
        sf.write(buffer, audio, 48_000, format="WAV")
        return buffer.getvalue()
