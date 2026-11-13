# Plug in a real vocal-separation model here. The sidecar (app.py) only
# calls `separate_vocals_wav(song_path) -> bytes` (a WAV file of the isolated
# vocal stem) — swap the body below without touching app.py.
#
# Demucs (facebookresearch/demucs) is the natural fit: MIT-licensed code, and
# it decodes mp3/wav/m4a itself (no ffmpeg pre-conversion needed on the Node
# side). Not installed by default — see requirements.txt. It downloads its
# own pretrained weights on first run; verify that model's license for your
# use case before shipping.
#
# Example using demucs' in-process API (no CLI subprocess, no output
# directory to manage — it returns tensors directly):
#
#   import tempfile
#   import torchaudio
#   from demucs.api import Separator
#
#   _separator = Separator()
#
#   def separate_vocals_wav(song_path: str) -> bytes:
#       _, stems = _separator.separate_audio_file(song_path)
#       vocals = stems["vocals"]
#       with tempfile.NamedTemporaryFile(suffix=".wav") as out:
#           torchaudio.save(out.name, vocals, _separator.samplerate)
#           return out.read()


def separate_vocals_wav(song_path: str) -> bytes:
    raise RuntimeError(
        "Chưa cấu hình tách giọng. Mở "
        "server/services/voice/python/separation.py để nối Demucs."
    )
