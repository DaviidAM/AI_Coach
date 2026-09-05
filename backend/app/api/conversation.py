from fastapi import APIRouter, HTTPException

from app.models import SummaryResponse, ResetResponse
from app.session import store
from app.llm import summarize_conversation, LLMError

router = APIRouter(prefix="/api/conversation", tags=["conversation"])


@router.get("/summary")
def get_summary(session_id: str) -> SummaryResponse:
    level = store.get_level(session_id)
    messages = store.get_history_for_llm(session_id)

    # summarize_conversation handles the empty case without burning tokens
    summary = summarize_conversation(level, messages)
    return SummaryResponse(summary=summary)


@router.post("/reset")
def reset_conversation(session_id: str) -> ResetResponse:
    store.reset(session_id)
    return ResetResponse(ok=True)
