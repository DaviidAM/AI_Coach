"""In-memory storage for interview coach sessions.

Kept separate from ``app.session`` so the English coach and the interview
coach never share conversation state, limits, or configuration.
"""

import logging
import os
import time
from threading import Lock
from typing import Optional

from app.llm import DEFAULT_SETTINGS

_logger = logging.getLogger(__name__)

MAX_INTERVIEW_MESSAGES = 64


def _parse_interview_message_limit() -> Optional[int]:
    """Parse INTERVIEW_MESSAGE_LIMIT.

    - unset / empty -> 20 (interview-sized default)
    - "-1"         -> unlimited
    - positive int -> that cap
    - anything else -> 20 + warning
    """
    raw = os.getenv("INTERVIEW_MESSAGE_LIMIT", "")
    if not raw:
        return 20
    if raw == "-1":
        return None
    try:
        value = int(raw)
    except ValueError:
        _logger.warning(
            "INTERVIEW_MESSAGE_LIMIT=%r is not an integer; defaulting to 20.", raw
        )
        return 20
    if value <= 0:
        _logger.warning(
            "INTERVIEW_MESSAGE_LIMIT=%d is not valid; defaulting to 20.", value
        )
        return 20
    return value


def get_interview_message_limit() -> Optional[int]:
    """Return the current cap (None = unlimited)."""
    return _parse_interview_message_limit()


class InterviewSessionData:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.interview_type: Optional[str] = None
        self.offer_text: str = ""
        self.brief: Optional[dict] = None
        self.opening_message: str = ""
        self.opening_audio_url: Optional[str] = None
        self.messages: list[dict] = []
        self.answer_count: int = 0
        self.feedback: list[dict] = []
        self.strengths: list[str] = []
        self.turn_scores: list[dict] = []
        self.report: Optional[dict] = None
        self.settings: dict = DEFAULT_SETTINGS.copy()
        self.created_at: float = time.time()
        self.last_activity: float = time.time()
        self.lock = Lock()

    @property
    def configured(self) -> bool:
        return self.interview_type is not None and self.brief is not None


class InterviewStore:
    def __init__(self):
        self._sessions: dict[str, InterviewSessionData] = {}
        self._lock = Lock()

    def get_or_create(self, session_id: str) -> InterviewSessionData:
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = InterviewSessionData(session_id)
            return self._sessions[session_id]

    def get(self, session_id: str) -> Optional[InterviewSessionData]:
        with self._lock:
            return self._sessions.get(session_id)

    def setup(
        self,
        session_id: str,
        interview_type: str,
        offer_text: str,
        brief: dict,
        opening_message: str,
        opening_audio_url: Optional[str] = None,
    ) -> InterviewSessionData:
        session = self.get_or_create(session_id)
        with session.lock:
            session.interview_type = interview_type
            session.offer_text = offer_text
            session.brief = dict(brief)
            session.opening_message = opening_message
            session.opening_audio_url = opening_audio_url
            session.messages = [
                {
                    "role": "interviewer",
                    "text": opening_message,
                    "audio_url": opening_audio_url,
                    "timestamp": _now_iso(),
                }
            ]
            session.answer_count = 0
            session.feedback = []
            session.strengths = []
            session.turn_scores = []
            session.report = None
            session.created_at = time.time()
            session.last_activity = time.time()
            return session

    def is_configured(self, session_id: str) -> bool:
        session = self.get(session_id)
        if session is None:
            return False
        with session.lock:
            return session.configured

    def is_at_limit(self, session_id: str) -> bool:
        limit = get_interview_message_limit()
        if limit is None:
            return False
        session = self.get_or_create(session_id)
        with session.lock:
            return session.answer_count >= limit

    def append_message(
        self,
        session_id: str,
        role: str,
        text: str,
        audio_url: Optional[str] = None,
    ) -> list[dict]:
        session = self.get_or_create(session_id)
        with session.lock:
            session.messages.append(
                {
                    "role": role,
                    "text": text,
                    "audio_url": audio_url,
                    "timestamp": _now_iso(),
                }
            )
            if role == "candidate":
                session.answer_count += 1
            session.last_activity = time.time()
            if len(session.messages) > MAX_INTERVIEW_MESSAGES:
                session.messages = session.messages[-MAX_INTERVIEW_MESSAGES:]
            return list(session.messages)

    def add_evaluation(
        self,
        session_id: str,
        feedback: list[dict],
        score: int,
        strengths: list[str],
        turn: int,
    ) -> None:
        session = self.get_or_create(session_id)
        with session.lock:
            session.feedback.extend(feedback)
            session.turn_scores.append(
                {"turn": turn, "score": score, "strengths": list(strengths)}
            )
            for strength in strengths:
                if strength and strength not in session.strengths:
                    session.strengths.append(strength)
            session.last_activity = time.time()

    def get_messages(self, session_id: str) -> list[dict]:
        session = self.get_or_create(session_id)
        with session.lock:
            return [dict(m) for m in session.messages]

    def get_answer_count(self, session_id: str) -> int:
        session = self.get_or_create(session_id)
        with session.lock:
            return session.answer_count

    def get_history_for_llm(self, session_id: str) -> list[dict]:
        """Map interview roles to chat-completion roles."""
        messages = self.get_messages(session_id)
        return [
            {
                "role": "assistant" if m["role"] == "interviewer" else "user",
                "content": m["text"],
            }
            for m in messages
        ]

    def get_feedback(self, session_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
        session = self.get_or_create(session_id)
        with session.lock:
            newest_first = list(reversed(session.feedback))
        return [dict(f) for f in newest_first[offset : offset + limit]]

    def feedback_count(self, session_id: str) -> int:
        session = self.get_or_create(session_id)
        with session.lock:
            return len(session.feedback)

    def get_turn_scores(self, session_id: str) -> list[int]:
        session = self.get_or_create(session_id)
        with session.lock:
            return [int(item["score"]) for item in session.turn_scores]

    def get_strengths(self, session_id: str) -> list[str]:
        session = self.get_or_create(session_id)
        with session.lock:
            return list(session.strengths)

    def get_latest_strengths(self, session_id: str) -> list[str]:
        session = self.get_or_create(session_id)
        with session.lock:
            if not session.turn_scores:
                return []
            return list(session.turn_scores[-1].get("strengths", []))

    def get_brief(self, session_id: str) -> Optional[dict]:
        session = self.get(session_id)
        if session is None:
            return None
        with session.lock:
            return dict(session.brief) if session.brief else None

    def get_interview_type(self, session_id: str) -> Optional[str]:
        session = self.get(session_id)
        if session is None:
            return None
        with session.lock:
            return session.interview_type

    def get_opening(self, session_id: str) -> tuple[str, Optional[str]]:
        session = self.get_or_create(session_id)
        with session.lock:
            return session.opening_message, session.opening_audio_url

    def save_report(self, session_id: str, report: dict) -> None:
        session = self.get_or_create(session_id)
        with session.lock:
            session.report = dict(report)
            session.last_activity = time.time()

    def get_report(self, session_id: str) -> Optional[dict]:
        session = self.get_or_create(session_id)
        with session.lock:
            return dict(session.report) if session.report else None

    def get_settings(self, session_id: str) -> dict:
        session = self.get_or_create(session_id)
        with session.lock:
            return dict(session.settings)

    def reset(self, session_id: str, keep_setup: bool = True) -> None:
        session = self.get_or_create(session_id)
        with session.lock:
            session.answer_count = 0
            session.feedback = []
            session.strengths = []
            session.turn_scores = []
            session.report = None
            session.last_activity = time.time()
            if keep_setup and session.configured:
                session.messages = [
                    {
                        "role": "interviewer",
                        "text": session.opening_message,
                        "audio_url": session.opening_audio_url,
                        "timestamp": _now_iso(),
                    }
                ]
            else:
                session.messages = []
                if not keep_setup:
                    session.interview_type = None
                    session.offer_text = ""
                    session.brief = None
                    session.opening_message = ""
                    session.opening_audio_url = None

    def reset_all(self) -> None:
        """Clear every session. Used by tests to prevent cross-test bleed."""
        with self._lock:
            self._sessions.clear()


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


# Module-level singleton. ``get_store`` keeps imports fresh after a module
# reload (mirrors app.session.store).
store = InterviewStore()


def get_store() -> InterviewStore:
    return store
