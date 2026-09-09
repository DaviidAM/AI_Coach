import time
from typing import Optional
from threading import Lock

MAX_MESSAGES = 10
IDLE_TIMEOUT_SECONDS = 30 * 60  # 30 minutes


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
