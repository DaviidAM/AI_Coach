"""Text-to-speech helpers.

The primary engine is Microsoft Edge TTS (``edge-tts``), which produces the
best quality and is the engine documented for AI Coach. Some networks reject
Edge TTS requests with an upstream 403, so a network fallback is required to
keep the "every message has audio" contract working.

Fallback order:

1. ``edge-tts`` (en-US-AriaNeural by default).
2. Google Translate's public TTS endpoint, split into short chunks.

If both engines fail, :class:`TTSUnavailable` is raised. Callers decide whether
audio is mandatory (the English chat degrades to text) or best-effort (the
interview chat already treats it as non-fatal).
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

import edge_tts
import httpx

_logger = logging.getLogger(__name__)

DEFAULT_VOICE = "en-US-AriaNeural"

# Google's endpoint accepts roughly 200 characters per request.
_GOOGLE_CHUNK_LIMIT = 180
_GOOGLE_ENDPOINTS = (
    "https://translate.google.com/translate_tts",
    "https://translate.googleapis.com/translate_tts",
)
_GOOGLE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Referer": "https://translate.google.com/",
}


class TTSUnavailable(RuntimeError):
    """Raised when every configured TTS engine fails."""


async def _synthesize_impl(text: str, output_path: Path, voice: str) -> None:
    """Async implementation using edge-tts."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_path))


def _split_for_google(text: str, limit: int = _GOOGLE_CHUNK_LIMIT) -> list[str]:
    """Split text into chunks that Google's TTS endpoint accepts.

    Prefer sentence boundaries, then word boundaries, and finally split a
    single oversized token by character count so the request can never exceed
    the endpoint limit.
    """
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []

    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        current = ""

    for sentence in sentences:
        words = sentence.split()
        for word in words:
            if len(word) > limit:
                flush()
                chunks.extend(word[i : i + limit] for i in range(0, len(word), limit))
                continue
            candidate = f"{current} {word}".strip()
            if len(candidate) > limit:
                flush()
                current = word
            else:
                current = candidate
        # Keep sentence punctuation attached before moving to the next one.
        flush()

    flush()
    return chunks


async def _fetch_google_chunk(client: httpx.AsyncClient, chunk: str) -> bytes:
    params = {
        "ie": "UTF-8",
        "q": chunk,
        "tl": "en",
        "client": "tw-ob",
        "ttsspeed": "1",
    }
    last_error: Exception | None = None
    for endpoint in _GOOGLE_ENDPOINTS:
        try:
            response = await client.get(endpoint, params=params, headers=_GOOGLE_HEADERS)
        except Exception as exc:  # noqa: BLE001 - try the next endpoint
            last_error = exc
            continue
        if response.status_code == 200 and response.content:
            return response.content
        last_error = RuntimeError(
            f"Google TTS returned {response.status_code} from {endpoint}"
        )
    raise RuntimeError(f"Google TTS unavailable: {last_error}")


async def _synthesize_google(text: str) -> bytes:
    """Return MP3 bytes from Google Translate's public TTS endpoint."""
    chunks = _split_for_google(text)
    if not chunks:
        raise ValueError("Cannot synthesize empty text")

    # Google returns one complete MP3 stream per chunk. MP3 frames can be
    # concatenated safely and every browser/HTML5 audio element plays them as
    # one continuous stream.
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        parts: list[bytes] = []
        for chunk in chunks:
            parts.append(await _fetch_google_chunk(client, chunk))
    return b"".join(parts)


def _edge_output_ready(output_path: Path) -> bool:
    try:
        return output_path.exists() and output_path.stat().st_size > 0
    except OSError:
        return False


async def synthesize(text: str, output_path: Path, voice: str = DEFAULT_VOICE) -> None:
    """Synthesize text to an MP3 file.

    Args:
        text: Text to synthesize.
        output_path: Destination ``.mp3`` file path.
        voice: Edge TTS voice name. Defaults to ``en-US-AriaNeural``.

    Raises:
        TTSUnavailable: If Edge TTS and the Google fallback both fail.
    """
    if not text or not text.strip():
        raise ValueError("Cannot synthesize empty text")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    edge_error: Exception | None = None
    try:
        await _synthesize_impl(text, output_path, voice)
        if not _edge_output_ready(output_path):
            raise RuntimeError("edge-tts produced no audio")
        return
    except Exception as exc:  # noqa: BLE001 - fallback is intentional
        edge_error = exc
        _logger.warning("edge-tts failed, trying Google fallback: %s", exc)
        try:
            output_path.unlink(missing_ok=True)
        except OSError:
            pass

    try:
        audio = await _synthesize_google(text)
        output_path.write_bytes(audio)
    except Exception as google_exc:  # noqa: BLE001 - surface one clear error
        try:
            output_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise TTSUnavailable(
            "No TTS engine is available. "
            f"edge-tts: {edge_error}; Google fallback: {google_exc}"
        ) from google_exc

    if not _edge_output_ready(output_path):
        raise TTSUnavailable("TTS fallback produced no audio")
