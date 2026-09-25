import os
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["config"])

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

    messages_used = store.get_message_count(session_id)
    unlimited = DEMO_MESSAGE_LIMIT < 0

    return ConfigResponse(
        demo_message_limit=DEMO_MESSAGE_LIMIT,
        messages_used=messages_used,
        unlimited=unlimited,
    )
