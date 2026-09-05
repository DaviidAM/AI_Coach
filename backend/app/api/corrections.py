from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from threading import Lock

router = APIRouter(prefix="/api/corrections", tags=["corrections"])


# In-memory corrections store: session_id -> list of correction dicts with metadata
_corrections_store: dict[str, list[dict]] = {}
_corrections_lock: dict[str, Lock] = {}
_lock_creation = Lock()  # only used to safely create per-session locks


def _get_lock(session_id: str) -> Lock:
    """Get or create a lock for a session's corrections."""
    with _lock_creation:
        if session_id not in _corrections_lock:
            _corrections_lock[session_id] = Lock()
        return _corrections_lock[session_id]


def store_corrections(session_id: str, corrections: list[dict]) -> None:
    """Store corrections for a session (append with timestamp)."""
    lock = _get_lock(session_id)
    with lock:
        if session_id not in _corrections_store:
            _corrections_store[session_id] = []
        for c in corrections:
            _corrections_store[session_id].append({
                "original_phrase": c["original_phrase"],
                "corrected_phrase": c["corrected_phrase"],
                "explanation": c["explanation"],
                "error_level": c["error_level"],
                "category": c["category"],
                "timestamp": datetime.utcnow().isoformat(),
            })


def get_corrections(session_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
    """Retrieve paginated corrections for a session."""
    lock = _get_lock(session_id)
    with lock:
        all_corrections = _corrections_store.get(session_id, [])
        paginated = all_corrections[offset:offset + limit]
        return list(reversed(paginated))


class CorrectionsResponse(BaseModel):
    corrections: list[dict]
    total: int


@router.get("", response_model=CorrectionsResponse)
async def get_corrections_endpoint(
    session_id: str,
    limit: int = 20,
    offset: int = 0,
):
    """
    Get paginated corrections history for a session.

    - **session_id**: Session identifier
    - **limit**: Max number of corrections to return (default 20)
    - **offset**: Number of corrections to skip (default 0)
    """
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be non-negative")

    lock = _get_lock(session_id)
    with lock:
        total = len(_corrections_store.get(session_id, []))

    corrections = get_corrections(session_id, limit=limit, offset=offset)

    return CorrectionsResponse(corrections=corrections, total=total)
