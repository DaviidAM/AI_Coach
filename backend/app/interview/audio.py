"""Audio helpers for the interview coach.

Files are written under the same static/audio directory as the English coach,
using an ``int_`` prefix so the two features never overwrite each other.
"""

import logging
import uuid
from pathlib import Path
from typing import Optional

from app.stt import transcribe
from app.tts import synthesize

_logger = logging.getLogger(__name__)

_AUDIO_DIR = Path(__file__).parent.parent / "static" / "audio"
_STT_DIR = _AUDIO_DIR / "stt"

_MIME_EXT = {
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/mp4": "mp4",
}

ALLOWED_AUDIO_MIMES = set(_MIME_EXT.keys())
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB


def get_audio_dir() -> Path:
    return _AUDIO_DIR


def get_stt_dir() -> Path:
    return _STT_DIR


def ensure_dirs() -> None:
    get_audio_dir().mkdir(parents=True, exist_ok=True)
    get_stt_dir().mkdir(parents=True, exist_ok=True)


def ext_for_mime(mime: str) -> str:
    base = (mime or "").split(";", 1)[0].strip().lower()
    return _MIME_EXT.get(base, "bin")


def save_recording(audio_bytes: bytes, mime: str) -> tuple[Path, str]:
    """Save the candidate's original recording and return (path, public URL)."""
    ensure_dirs()
    extension = ext_for_mime(mime)
    filename = f"int_stt_{uuid.uuid4()}.{extension}"
    path = get_stt_dir() / filename
    path.write_bytes(audio_bytes)
    return path, f"/static/audio/stt/{filename}"


def transcribe_recording(audio_bytes: bytes) -> str:
    return transcribe(audio_bytes)


async def synthesize_to_url(text: str, label: str = "reply") -> Optional[str]:
    """Synthesize text and return a public URL. TTS failure is non-fatal."""
    if not text or not text.strip():
        return None
    ensure_dirs()
    filename = f"int_{label}_{uuid.uuid4()}.mp3"
    path = get_audio_dir() / filename
    try:
        await synthesize(text, path)
    except Exception as exc:  # noqa: BLE001 - audio must not break the interview
        _logger.warning("Interview TTS failed: %s", exc)
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return None
    return f"/static/audio/{filename}"
