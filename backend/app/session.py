import logging
import os
import time
from typing import Optional
from threading import Lock

MAX_MESSAGES = 10
IDLE_TIMEOUT_SECONDS = 30 * 60  # 30 minutes

_logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------
# DEMO_MESSAGE_LIMIT — deployment-time env var for the user-facing demo
# cap.  Parsed once at module import time so every request sees the same
# value (consistent with how OMNIROUTE_DEFAULT_MODEL is read in llm.py).
#
#   "5"  (or any positive int string) → cap user messages at that number
#   "-1"                              → unlimited (demo mode disabled)
#   unset / empty / non-integer / negative other than -1 → 5 + warning
# ----------------------------------------------------------------------
def _parse_demo_message_limit() -> Optional[int]:
    raw = os.getenv("DEMO_MESSAGE_LIMIT", "")
    if not raw:
        _logger.warning(
            "DEMO_MESSAGE_LIMIT is not set; defaulting to 5. "
            "Set DEMO_MESSAGE_LIMIT=-1 for unlimited (AACoach deployment)."
        )
        return 5
    if raw == "-1":
        return None  # unlimited
    try:
        val = int(raw)
    except ValueError:
        _logger.warning(
            "DEMO_MESSAGE_LIMIT=%r is not an integer; defaulting to 5. "
            "Valid values: a positive integer or -1 for unlimited.",
            raw,
        )
        return 5
    if val < 0 and val != -1:
        _logger.warning(
            "DEMO_MESSAGE_LIMIT=%d is negative (and not -1); defaulting to 5.", val
        )
        return 5
    if val == 0:
        _logger.warning("DEMO_MESSAGE_LIMIT=0 is not valid; defaulting to 5.")
        return 5
    return val


DEMO_MESSAGE_LIMIT: Optional[int] = _parse_demo_message_limit()  # int or None (=unlimited)


def is_at_demo_limit(session_id: str) -> bool:
    """Return True when the next user message would exceed DEMO_MESSAGE_LIMIT.

    Always returns False when DEMO_MESSAGE_LIMIT is None (unlimited).
    """
    if DEMO_MESSAGE_LIMIT is None:
        return False
    session = store.get_or_create(session_id)
    with session.lock:
        user_count = sum(1 for m in session.messages if m.get("role") == "user")
    return user_count >= DEMO_MESSAGE_LIMIT


from app.llm import DEFAULT_SETTINGS

class SessionData:
    def __init__(self):
        self.messages: list[dict] = []
        self.level: str = "A1"
        self.last_activity: float = time.time()
        self.lock = Lock()
        # OmniRoute is the default — it routes to free models without
        # requiring an API key. MiniMax remains as a fallback option.
        # Model is read from env-backed DEFAULT_SETTINGS.
        self.settings: dict = DEFAULT_SETTINGS.copy()


class SessionStore:
    def __init__(self):
        self._sessions: dict[str, SessionData] = {}
        self._lock = Lock()

    def get_or_create(self, session_id: str) -> SessionData:
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = SessionData()
            return self._sessions[session_id]

    def append_message(self, session_id: str, role: str, text: str) -> list[dict]:
        session = self.get_or_create(session_id)
        with session.lock:
            session.messages.append({"role": role, "text": text})
            session.last_activity = time.time()
            # Keep only last MAX_MESSAGES
            if len(session.messages) > MAX_MESSAGES:
                session.messages = session.messages[-MAX_MESSAGES:]
            return session.messages

    def get_level(self, session_id: str) -> str:
        session = self.get_or_create(session_id)
        with session.lock:
            return session.level

    def set_level(self, session_id: str, level: str) -> None:
        session = self.get_or_create(session_id)
        with session.lock:
            session.level = level
            session.last_activity = time.time()

    def get_messages(self, session_id: str) -> list[dict]:
        session = self.get_or_create(session_id)
        with session.lock:
            return list(session.messages)

    def reset(self, session_id: str) -> None:
        session = self.get_or_create(session_id)
        with session.lock:
            session.messages = []
            session.last_activity = time.time()

    def get_settings(self, session_id: str) -> dict:
        session = self.get_or_create(session_id)
        with session.lock:
            return dict(session.settings)

    def set_settings(self, session_id: str, settings: dict) -> None:
        session = self.get_or_create(session_id)
        with session.lock:
            session.settings = dict(settings)
            session.last_activity = time.time()

    def get_history_for_llm(self, session_id: str) -> list[dict]:
        """Return messages formatted for LLM (role, content)."""
        msgs = self.get_messages(session_id)
        return [{"role": m["role"], "content": m["text"]} for m in msgs]


store = SessionStore()
