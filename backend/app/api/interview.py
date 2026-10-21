"""Interview coach API routes."""

from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.interview.audio import (
    ALLOWED_AUDIO_MIMES,
    MAX_AUDIO_BYTES,
    save_recording,
    synthesize_to_url,
    transcribe_recording,
)
from app.interview.llm import generate_brief, generate_report, generate_turn
from app.interview.models import (
    FeedbackHistoryResponse,
    FeedbackItem,
    InterviewBrief,
    InterviewMessage,
    InterviewTurnResponse,
    ReportResponse,
    ResetResponse,
    SessionResponse,
    SetupResponse,
    SkillInfo,
    SkillsResponse,
)
from app.interview.offer import (
    MAX_FILE_BYTES,
    OfferExtractionError,
    clean_offer,
    extract_offer_text,
)
from app.interview.skills import get_skill, list_skills
from app.interview.store import get_interview_message_limit, get_store

router = APIRouter(prefix="/api/interview", tags=["interview"])


def _fallback_headers(reason: str) -> dict[str, str]:
    """HTTP headers must be latin-1; keep the diagnostic ASCII-only."""
    safe = reason.encode("ascii", "ignore").decode("ascii").strip()
    return {"X-Fallback": safe[:200]} if safe else {}


# ---------------------------------------------------------------------------
# Skills + setup
# ---------------------------------------------------------------------------

@router.get("/skills", response_model=SkillsResponse)
def get_skills() -> SkillsResponse:
    limit = get_interview_message_limit()
    return SkillsResponse(
        skills=[SkillInfo(**item) for item in list_skills()],
        message_limit=limit,
        unlimited=limit is None,
    )


@router.post("/setup")
async def setup_interview(
    session_id: str = Form(...),
    interview_type: str = Form(...),
    job_text: Optional[str] = Form(None),
    job_file: Optional[UploadFile] = File(None),
):
    """Configure an interview from pasted text or an uploaded offer file."""
    try:
        skill = get_skill(interview_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    if not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")

    has_text = bool(job_text and job_text.strip())
    has_file = job_file is not None

    if has_text and has_file:
        raise HTTPException(
            status_code=400, detail="Provide either job_text or job_file, not both"
        )
    if not has_text and not has_file:
        raise HTTPException(
            status_code=400, detail="Provide a job offer as text or as a file"
        )

    if has_file:
        filename = job_file.filename or ""
        content = await job_file.read()
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=413, detail="The uploaded file is larger than 5 MB"
            )
        try:
            offer_text = extract_offer_text(filename, content)
        except OfferExtractionError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None
    else:
        offer_text = clean_offer(job_text or "")
        if not offer_text:
            raise HTTPException(status_code=422, detail="The job offer text is empty")

    interview_store = get_store()
    settings = interview_store.get_settings(session_id)
    brief, opening_message, fallback_reason = await run_in_threadpool(
        generate_brief, skill, offer_text, settings
    )
    opening_audio_url = await synthesize_to_url(opening_message, "opening")

    interview_store.setup(
        session_id=session_id,
        interview_type=interview_type,
        offer_text=offer_text,
        brief=brief,
        opening_message=opening_message,
        opening_audio_url=opening_audio_url,
    )

    payload = SetupResponse(
        session_id=session_id,
        interview_type=interview_type,  # type: ignore[arg-type]
        brief=InterviewBrief(**brief),
        opening_message=opening_message,
        opening_audio_url=opening_audio_url,
        turn=0,
    )
    if fallback_reason:
        return JSONResponse(
            content=payload.model_dump(),
            headers=_fallback_headers(fallback_reason),
        )
    return payload


@router.get("/session", response_model=SessionResponse)
def get_session(session_id: str) -> SessionResponse:
    interview_store = get_store()
    session = interview_store.get(session_id)
    if session is None or not session.configured:
        return SessionResponse(configured=False, session_id=session_id)

    messages = [
        InterviewMessage(
            role=message["role"],
            text=message["text"],
            audio_url=message.get("audio_url"),
            timestamp=message.get("timestamp"),
        )
        for message in interview_store.get_messages(session_id)
    ]
    # Feedback is stored chronologically; the session view wants it in the
    # same order as the conversation.
    feedback = list(
        reversed(interview_store.get_feedback(session_id, limit=1000, offset=0))
    )
    brief = interview_store.get_brief(session_id) or {}
    interview_type = interview_store.get_interview_type(session_id)
    return SessionResponse(
        configured=True,
        session_id=session_id,
        interview_type=interview_type,  # type: ignore[arg-type]
        brief=InterviewBrief(**brief),
        messages=messages,
        feedback=[FeedbackItem(**item) for item in feedback],
        strengths=interview_store.get_strengths(session_id),
        latest_strengths=interview_store.get_latest_strengths(session_id),
        turn=interview_store.get_answer_count(session_id),
        answer_scores=interview_store.get_turn_scores(session_id),
        report=interview_store.get_report(session_id),
    )


# ---------------------------------------------------------------------------
# Chat turn
# ---------------------------------------------------------------------------

@router.post("/chat")
async def interview_chat(
    session_id: str = Form(...),
    text: Optional[str] = Form(None),
    audio: Optional[UploadFile] = File(None),
):
    interview_store = get_store()
    if not interview_store.is_configured(session_id):
        raise HTTPException(
            status_code=409,
            detail="Interview not configured. Submit a job offer and interview type first.",
        )

    has_text = bool(text and text.strip())
    has_audio = audio is not None
    if has_text and has_audio:
        raise HTTPException(
            status_code=400, detail="Provide either text or audio, not both"
        )
    if not has_text and not has_audio:
        raise HTTPException(
            status_code=400, detail="Either text or audio must be provided"
        )

    if interview_store.is_at_limit(session_id):
        raise HTTPException(status_code=429, detail="Interview message limit reached")

    user_text: str
    user_audio_url: Optional[str] = None

    if has_audio:
        base_mime = (audio.content_type or "").split(";", 1)[0].strip().lower()
        if base_mime not in ALLOWED_AUDIO_MIMES:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported audio MIME type: {audio.content_type}",
            )
        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=422, detail="The audio file is empty")
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413, detail="The audio file is larger than 10 MB"
            )
        _, user_audio_url = save_recording(audio_bytes, audio.content_type or "")
        try:
            user_text = (
                await run_in_threadpool(transcribe_recording, audio_bytes)
            ).strip()
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail="Could not transcribe the audio. Please try again or type your answer.",
            ) from exc
        if not user_text:
            raise HTTPException(
                status_code=422,
                detail="Could not transcribe the audio. Please try again or type your answer.",
            )
    else:
        user_text = (text or "").strip()
        user_audio_url = await synthesize_to_url(user_text, "user")

    brief = interview_store.get_brief(session_id) or {}
    interview_type = interview_store.get_interview_type(session_id) or "technical"
    try:
        skill = get_skill(interview_type)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None

    current_question = _last_interviewer_question(interview_store.get_messages(session_id))
    interview_store.append_message(
        session_id, "candidate", user_text, audio_url=user_audio_url
    )

    history = interview_store.get_history_for_llm(session_id)
    turn = interview_store.get_answer_count(session_id)

    result, fallback_reason = await run_in_threadpool(
        generate_turn,
        skill=skill,
        brief=brief,
        history=history,
        current_question=current_question,
        turn=turn,
        settings=interview_store.get_settings(session_id),
    )

    feedback = [FeedbackItem(**item) for item in result.get("feedback", [])]
    interviewer_text = result.get("interviewer_reply", "")
    interviewer_audio_url = await synthesize_to_url(interviewer_text, "reply")

    interview_store.add_evaluation(
        session_id=session_id,
        feedback=[item.model_dump() for item in feedback],
        score=int(result.get("answer_score", 3)),
        strengths=list(result.get("strengths", [])),
        turn=turn,
    )
    interview_store.append_message(
        session_id, "interviewer", interviewer_text, audio_url=interviewer_audio_url
    )

    payload = InterviewTurnResponse(
        session_id=session_id,
        user_text=user_text,
        user_audio_url=user_audio_url,
        interviewer_text=interviewer_text,
        interviewer_audio_url=interviewer_audio_url,
        feedback=feedback,
        strengths=list(result.get("strengths", [])),
        answer_score=int(result.get("answer_score", 3)),
        turn=turn,
    )
    if fallback_reason:
        return JSONResponse(
            content=payload.model_dump(),
            headers=_fallback_headers(fallback_reason),
        )
    return payload


def _last_interviewer_question(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") == "interviewer":
            return message.get("text", "")
    return ""


# ---------------------------------------------------------------------------
# Feedback + report + reset
# ---------------------------------------------------------------------------

@router.get("/feedback", response_model=FeedbackHistoryResponse)
def get_feedback(session_id: str, limit: int = 20, offset: int = 0):
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be non-negative")

    interview_store = get_store()
    total = interview_store.feedback_count(session_id)
    feedback = interview_store.get_feedback(session_id, limit=limit, offset=offset)
    return FeedbackHistoryResponse(
        feedback=[FeedbackItem(**item) for item in feedback],
        total=total,
    )


@router.post("/report")
def end_interview(session_id: str):
    interview_store = get_store()
    if not interview_store.is_configured(session_id):
        raise HTTPException(status_code=409, detail="Interview not configured")

    interview_type = interview_store.get_interview_type(session_id) or "technical"
    try:
        skill = get_skill(interview_type)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None

    brief = interview_store.get_brief(session_id) or {}
    report, fallback_reason = generate_report(
        skill=skill,
        brief=brief,
        history=interview_store.get_history_for_llm(session_id),
        feedback=interview_store.get_feedback(session_id, limit=1000, offset=0),
        scores=interview_store.get_turn_scores(session_id),
        strengths=interview_store.get_strengths(session_id),
        settings=interview_store.get_settings(session_id),
    )
    interview_store.save_report(session_id, report)

    payload = ReportResponse(**report)
    if fallback_reason:
        return JSONResponse(
            content=payload.model_dump(),
            headers=_fallback_headers(fallback_reason),
        )
    return payload


@router.post("/reset", response_model=ResetResponse)
def reset_interview(session_id: str, keep_setup: bool = True):
    get_store().reset(session_id, keep_setup=keep_setup)
    return ResetResponse(ok=True)
