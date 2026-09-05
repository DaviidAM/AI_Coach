from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Response
from fastapi.responses import JSONResponse
import uuid
from pathlib import Path

from app.models import ChatResponse, Correction
from app.llm import get_llm_reply, LLMError
from app.session import store
from app.filter import filter_corrections
from app.stt import transcribe
from app.tts import synthesize
from app.api.corrections import store_corrections

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Files written here are served at /static/audio/...
# Path is anchored to this file's directory (app/api/), so it matches
# the static dir mounted by app/main.py (app/static/).
AUDIO_DIR = Path(__file__).parent.parent / "static" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
STT_DIR = AUDIO_DIR / "stt"
STT_DIR.mkdir(parents=True, exist_ok=True)


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
        saved_path = STT_DIR / f"stt_{user_uuid}.{ext}"
        with open(saved_path, "wb") as f:
            f.write(audio_bytes)
        user_audio_url = f"/static/audio/stt/stt_{user_uuid}.{ext}"

        # Transcribe via STT
        user_text = transcribe(audio_bytes)

    else:
        user_text = text
        # Spec: regardless of text/audio input, generate TTS for the user's
        # message so the user can hear it played back AND the COACH's audio
        # has uniform context. Saves to /static/audio/<uuid>.mp3.
        user_uuid = uuid.uuid4()
        user_audio_path = AUDIO_DIR / f"{user_uuid}.mp3"
        await synthesize(user_text or "", user_audio_path)
        user_audio_url = f"/static/audio/{user_uuid}.mp3"

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

    # Synthesize TTS for coach reply (always, even for text-only input)
    coach_uuid = uuid.uuid4()
    coach_audio_path = AUDIO_DIR / f"{coach_uuid}.mp3"
    try:
        await synthesize(coach_text, coach_audio_path)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS synthesis failed: {e}") from None
    coach_audio_url = f"/static/audio/{coach_uuid}.mp3"

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
