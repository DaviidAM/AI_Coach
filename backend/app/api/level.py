from fastapi import APIRouter, HTTPException

from app.models import LevelSetRequest, LevelResponse
from app.session import store

router = APIRouter(prefix="/api/level", tags=["level"])


@router.get("")
def get_level(session_id: str) -> LevelResponse:
    level = store.get_level(session_id)
    return LevelResponse(level=level)


@router.post("")
def set_level(body: LevelSetRequest, session_id: str) -> LevelResponse:
    store.set_level(session_id, body.level)
    return LevelResponse(level=body.level)
