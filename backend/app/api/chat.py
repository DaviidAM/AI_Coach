from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Response
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
import logging
import uuid
from pathlib import Path

from app.models import ChatResponse, Correction
from app.llm import get_llm_reply, LLMError
from app.session import store, is_at_demo_limit
from app.filter import filter_corrections
from app.stt import transcribe
from app.tts import synthesize
from app.api.corrections import store_corrections

router = APIRouter(prefix="/api/chat", tags=["chat"])

_logger = logging.getLogger(__name__)


async def _safe_synthesize(text: str, output_path: Path, label: str) -> str | None:
    """Generate audio without ever breaking the text conversation.

    Both the user and coach messages are supposed to carry audio. If every
    TTS engine fails, the chat still returns 200 with the text and a ``None``
    audio URL, which is preferable to losing the whole turn behind a 500.
    """
    if not text or not text.strip():
        return None
    try:
        await synthesize(text, output_path)
    except Exception as exc:  # noqa: BLE001 - audio is best-effort per turn
        _logger.warning("%s TTS failed: %s", label, exc)
        try:
            output_path.unlink(missing_ok=True)
        except OSError:
            pass
        return None
    return f"/static/audio/{output_path.name}"

# Files written here are served at /static/audio/...
# Path is anchored to this file's directory (app/api/), so it matches
# the static dir mounted by app/main.py (app/static/).
_AUDIO_DIR = Path(__file__).parent.parent / "static" / "audio"
_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
_STT_DIR = _AUDIO_DIR / "stt"
_STT_DIR.mkdir(parents=True, exist_ok=True)

# Allow test fixtures to override these paths via monkeypatching.
# Production code uses the module-level defaults above.
def get_audio_dir():
    return _AUDIO_DIR

def get_stt_dir():
    return _STT_DIR


_MIME_EXT = {
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/mp4": "mp4",
}


# MIME type -> file extension mapping.
# Browsers send audio/webm;codecs=opus or audio/ogg;codecs=opus — we strip
# the codec suffix before matching.
def _ext_for_mime(mime: str) -> str:
    base = (mime or "").split(";", 1)[0].strip().lower()
    return _MIME_EXT.get(base, "bin")


# Allowed audio MIME types (base form, without codec suffix).
_ALLOWED_AUDIO_MIMES = {"audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4"}


@router.post("")
async def chat(
    text: str | None = Form(None),
    audio: UploadFile | None = File(None),
    session_id: str = Form(...),
):
    # Validate: exactly one of text or audio
    has_text = text is not None and text.strip() != ""
    has_audio = audio is not None

    if has_text and has_audio:
        raise HTTPException(status_code=400, detail="Provide either text or audio, not both")

    if not has_text and not has_audio:
        raise HTTPException(status_code=400, detail="Either text or audio must be provided")

    # Enforce the demo limit before doing any STT/TTS work. The limit is a
    # user-facing cap, not an LLM context limit, so an over-limit turn must
    # fail fast without writing orphan audio files.
    if is_at_demo_limit(session_id):
        raise HTTPException(status_code=429, detail="Demo message limit reached")

    user_text: str | None = None
    user_audio_url: str | None = None

    if has_audio:
        # Validate MIME type (strip codec suffix, e.g. "audio/webm;codecs=opus")
        base_mime = (audio.content_type or "").split(";", 1)[0].strip().lower()
        if base_mime not in _ALLOWED_AUDIO_MIMES:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported audio MIME type: {audio.content_type}",
            )

        # Read audio bytes
        audio_bytes = await audio.read()

        # Save the original user recording to disk (cherry-pick from old Gradio code)
        user_uuid = uuid.uuid4()
        ext = _ext_for_mime(audio.content_type)
        saved_path = get_stt_dir() / f"stt_{user_uuid}.{ext}"
        with open(saved_path, "wb") as f:
            f.write(audio_bytes)
        user_audio_url = f"/static/audio/stt/stt_{user_uuid}.{ext}"

        # Transcribe via STT. Run the CPU-bound model in a worker thread so
        # the event loop can keep serving the frontend.
        try:
            user_text = await run_in_threadpool(transcribe, audio_bytes)
        except Exception as exc:  # noqa: BLE001 - translate to a safe API error
            _logger.warning("STT failed: %s", exc)
            raise HTTPException(
                status_code=502,
                detail="Could not transcribe the audio. Please try again or type your message.",
            ) from exc

    else:
        user_text = text
        # Spec: regardless of text/audio input, generate TTS for the user's
        # message so the user can hear it played back AND the COACH's audio
        # has uniform context. Saves to /static/audio/<uuid>.mp3.
        user_uuid = uuid.uuid4()
        user_audio_path = get_audio_dir() / f"{user_uuid}.mp3"
        user_audio_url = await _safe_synthesize(user_text or "", user_audio_path, "user")

    # Get user level
    level = store.get_level(session_id)

    # Append user message to session
    if user_text:
        store.append_message(session_id, "user", user_text)

    # Get history for LLM
    history = store.get_history_for_llm(session_id)

    # Get LLM settings for this session
    settings = store.get_settings(session_id)

    # Call LLM
    try:
        llm_result, fallback_reason = get_llm_reply(level, history, settings)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    coach_text = llm_result["reply"]
    raw_corrections = llm_result.get("corrections", [])

    # Filter corrections by user level
    filtered = filter_corrections(raw_corrections, level)

    # Store corrections for history endpoint
    store_corrections(session_id, filtered)

    # Append coach message to session
    store.append_message(session_id, "assistant", coach_text)

    # Synthesize TTS for coach reply (always, even for text-only input).
    # Audio is best-effort here so a blocked TTS provider can never hide the
    # coach's text answer behind an HTTP 500.
    coach_uuid = uuid.uuid4()
    coach_audio_path = get_audio_dir() / f"{coach_uuid}.mp3"
    coach_audio_url = await _safe_synthesize(coach_text, coach_audio_path, "coach")

    response_data = {
        "session_id": session_id,
        "user_text": user_text,
        "user_audio_url": user_audio_url,
        "coach_text": coach_text,
        "coach_audio_url": coach_audio_url,
        "corrections": [Correction(**c).model_dump() for c in filtered],
    }

    if fallback_reason:
        return JSONResponse(content=response_data, headers={"X-Fallback": fallback_reason})

    return ChatResponse(**response_data)
