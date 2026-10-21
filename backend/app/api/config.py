import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/config", tags=["config"])

DEMO_MESSAGE_LIMIT = int(os.getenv("DEMO_MESSAGE_LIMIT", "5"))


class ConfigResponse(BaseModel):
    demo_message_limit: int
    messages_used: int
    unlimited: bool


@router.get("", response_model=ConfigResponse)
def get_config(session_id: str) -> ConfigResponse:
    """
    Return demo configuration for the given session.

    - **session_id**: Session identifier
    - **demo_message_limit**: Max messages allowed in demo mode (-1 = unlimited)
    - **messages_used**: Number of messages sent so far in this session
    - **unlimited**: True when demo_message_limit is -1
    """
    from app.session import store

    # Read the env var per request rather than reusing the module-level
    # constant captured at import time, so tests that monkeypatch the
    # environment observe the change and deploys can adjust the limit without
    # a restart.
    raw = os.getenv("DEMO_MESSAGE_LIMIT", "5")
    try:
        limit = int(raw)
    except ValueError:
        limit = 5
    if limit < -1:
        limit = 5

    messages_used = store.get_message_count(session_id)
    unlimited = limit < 0

    return ConfigResponse(
        demo_message_limit=limit,
        messages_used=messages_used,
        unlimited=unlimited,
    )
