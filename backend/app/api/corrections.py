import asyncio
import os
from pathlib import Path
from threading import Lock
from contextlib import asynccontextmanager

import aiosqlite
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/api/corrections", tags=["corrections"])

# ---------------------------------------------------------------------------
# SQLite persistence
# ---------------------------------------------------------------------------

DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
_CORR_DB = DATA_DIR / "corrections.db"

_corr_lock = Lock()  # serialise writes (SQLite fine with concurrent reads)
_init_done = False


async def _get_db():
    """Yield a connection to the corrections DB, init schema if needed."""
    global _init_done
    conn = await aiosqlite.connect(str(_CORR_DB))
    conn.row_factory = aiosqlite.Row
    if not _init_done:
        await conn.executescript("""
            CREATE TABLE IF NOT EXISTS corrections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id   TEXT NOT NULL,
                session_id TEXT NOT NULL,
                original_phrase  TEXT NOT NULL,
                corrected_phrase TEXT NOT NULL,
                explanation      TEXT NOT NULL,
                error_level      TEXT NOT NULL,
                category         TEXT NOT NULL DEFAULT 'general',
                user_text_snippet TEXT NOT NULL DEFAULT '',
                reviewed_at      TEXT,
                created_at       TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_corr_user ON corrections(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_corr_reviewed ON corrections(user_id, reviewed_at);
        """)
        await conn.commit()
        _init_done = True
    return conn


# ---------------------------------------------------------------------------
# In-memory corrections store (kept for backward compat with existing endpoints)
# ---------------------------------------------------------------------------

_corrections_store: dict[str, list[dict]] = {}
_corrections_lock: dict[str, Lock] = {}
_lock_creation = Lock()


def _get_lock(session_id: str) -> Lock:
    """Get or create a lock for a session's corrections."""
    with _lock_creation:
        if session_id not in _corrections_lock:
            _corrections_lock[session_id] = Lock()
        return _corrections_lock[session_id]


def store_corrections(session_id: str, corrections: list[dict], user_id: str | None = None) -> None:
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
    # Persist to SQLite asynchronously
    if corrections and user_id:
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(persist_corrections_batch(
                    user_id, session_id, corrections, user_id
                ))
            else:
                loop.run_until_complete(persist_corrections_batch(
                    user_id, session_id, corrections, user_id
                ))
        except Exception:
            pass


def get_corrections(session_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
    """Retrieve paginated corrections for a session."""
    lock = _get_lock(session_id)
    with lock:
        all_corrections = _corrections_store.get(session_id, [])
        paginated = all_corrections[offset:offset + limit]
        return list(reversed(paginated))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CorrectionsResponse(BaseModel):
    corrections: list[dict]
    total: int


class CorrectionRecord(BaseModel):
    id: int
    user_id: str
    session_id: str
    original_phrase: str
    corrected_phrase: str
    explanation: str
    error_level: str
    category: str
    user_text_snippet: str
    reviewed_at: Optional[str]
    created_at: str


class RecentResponse(BaseModel):
    corrections: list[CorrectionRecord]
    total: int


class QueueResponse(BaseModel):
    items: list[dict]
    total: int


# ---------------------------------------------------------------------------
# Existing history endpoint
# ---------------------------------------------------------------------------

@router.get("", response_model=CorrectionsResponse)
async def get_corrections_endpoint(
    session_id: str,
    limit: int = 20,
    offset: int = 0,
):
    """
    Get paginated corrections history for a session.
    Kept for backward compat; new SRS clients should use /recent.
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


# ---------------------------------------------------------------------------
# New SRS endpoints (user_id from X-User-Device-Id header)
# ---------------------------------------------------------------------------

def _require_user_id(x_user_device_id: Optional[str] = Header(None)) -> str:
    if not x_user_device_id:
        raise HTTPException(status_code=401, detail="X-User-Device-Id header required")
    return x_user_device_id


@router.get("/recent", response_model=RecentResponse)
async def get_recent_corrections(
    x_user_device_id: Optional[str] = Header(None),
    user_id: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
):
    """
    List a user's most recent corrections (newest first).
    User identity: X-User-Device-Id header (preferred) or user_id query param.
    """
    uid = _require_user_id(x_user_device_id) if x_user_device_id else (user_id or "anonymous")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")

    conn = await _get_db()
    try:
        cur = await conn.execute(
            """SELECT * FROM corrections
               WHERE user_id = ?
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?""",
            (uid, limit, offset),
        )
        rows = await cur.fetchall()

        cur2 = await conn.execute(
            "SELECT COUNT(*) FROM corrections WHERE user_id = ?", (uid,)
        )
        row2 = await cur2.fetchone()
        total = row2[0] if row2 else 0

        corrections = [CorrectionRecord(**dict(row)) for row in rows]
        return RecentResponse(corrections=corrections, total=total)
    finally:
        await conn.close()


@router.get("/queue", response_model=QueueResponse)
async def get_correction_queue(
    x_user_device_id: Optional[str] = Header(None),
    user_id: Optional[str] = None,
    limit: int = 10,
):
    """
    List a user's top K most frequent un-reviewed correction categories
    and original phrases, sorted by frequency (for the SRS review queue).
    """
    uid = _require_user_id(x_user_device_id) if x_user_device_id else (user_id or "anonymous")
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 50")

    conn = await _get_db()
    try:
        cur = await conn.execute(
            """SELECT category, original_phrase, corrected_phrase,
                      error_level, COUNT(*) as freq,
                      MAX(created_at) as last_seen
               FROM corrections
               WHERE user_id = ? AND reviewed_at IS NULL
               GROUP BY category, original_phrase
               ORDER BY freq DESC
               LIMIT ?""",
            (uid, limit),
        )
        rows = await cur.fetchall()

        cur2 = await conn.execute(
            "SELECT COUNT(DISTINCT category || original_phrase) FROM corrections "
            "WHERE user_id = ? AND reviewed_at IS NULL",
            (uid,),
        )
        row2 = await cur2.fetchone()
        total = row2[0] if row2 else 0

        items = [dict(row) for row in rows]
        return QueueResponse(items=items, total=total)
    finally:
        await conn.close()


@router.post("/{correction_id}/review", response_model=dict)
async def mark_reviewed(
    correction_id: int,
    x_user_device_id: Optional[str] = Header(None),
):
    """
    Mark a correction as reviewed (sets reviewed_at timestamp).
    User identity: X-User-Device-Id header.
    """
    uid = _require_user_id(x_user_device_id)
    conn = await _get_db()
    try:
        now = datetime.utcnow().isoformat()
        cur = await conn.execute(
            "UPDATE corrections SET reviewed_at = ? WHERE id = ? AND user_id = ?",
            (now, correction_id, uid),
        )
        await conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Correction not found or not yours")
        return {"ok": True, "correction_id": correction_id, "reviewed_at": now}
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# Internal: persist a correction to SQLite (called by chat.py after filtering)
# ---------------------------------------------------------------------------

async def persist_correction(
    user_id: str,
    session_id: str,
    correction: dict,
    user_text_snippet: str,
) -> int:
    """Insert a correction record into SQLite. Returns the row id."""
    conn = await _get_db()
    try:
        cur = await conn.execute(
            """INSERT INTO corrections
               (user_id, session_id, original_phrase, corrected_phrase,
                explanation, error_level, category, user_text_snippet)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                session_id,
                correction["original_phrase"],
                correction["corrected_phrase"],
                correction["explanation"],
                correction["error_level"],
                correction.get("category", "general"),
                user_text_snippet[:200],
            ),
        )
        await conn.commit()
        return cur.lastrowid or 0
    finally:
        await conn.close()


async def persist_corrections_batch(
    user_id: str,
    session_id: str,
    corrections: list[dict],
    user_text_snippet: str,
) -> list[int]:
    """Insert multiple corrections in a batch. Returns list of row ids."""
    if not corrections:
        return []
    conn = await _get_db()
    try:
        rows = [
            (
                user_id,
                session_id,
                c["original_phrase"],
                c["corrected_phrase"],
                c["explanation"],
                c["error_level"],
                c.get("category", "general"),
                user_text_snippet[:200],
            )
            for c in corrections
        ]
        await conn.executemany(
            """INSERT INTO corrections
               (user_id, session_id, original_phrase, corrected_phrase,
                explanation, error_level, category, user_text_snippet)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        await conn.commit()
        cur = await conn.execute(
            "SELECT last_insert_rowid() FROM corrections LIMIT 1"
        )
        last_id = (await cur.fetchone())[0]
        return list(range(last_id - len(corrections) + 1, last_id + 1))
    finally:
        await conn.close()
