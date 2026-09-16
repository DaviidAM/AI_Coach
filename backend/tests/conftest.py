"""Pytest conftest: test isolation fixtures for cross-test bleed."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

# Add backend/ to sys.path so `from app.xxx import yyy` works
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root))


# ─────────────────────────────────────────────────────────────────────────────
# FR-1: SessionStore isolation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset_session_store():
    """Clear SessionStore before and after every test to prevent cross-test bleed."""
    from app.session import store
    store.reset_all()
    yield
    store.reset_all()


# ─────────────────────────────────────────────────────────────────────────────
# FR-2: STT model isolation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset_stt_model():
    """Reset the module-level whisper model cache before and after every test."""
    import app.stt as stt_module
    stt_module._model = None
    yield
    stt_module._model = None


# ─────────────────────────────────────────────────────────────────────────────
# FR-3: static/audio/ cleanup via per-test temp directories
# ─────────────────────────────────────────────────────────────────────────────

# Non-autouse: tests that write audio files via chat.py use this explicitly.
# This prevents chat.py from polluting the real static/audio/ directory.
@pytest.fixture
def isolate_audio_dirs(tmp_path, monkeypatch):
    """
    Patch _AUDIO_DIR and _STT_DIR in chat.py to point to a per-test tmp_path.
    Chat tests that call get_audio_dir()/get_stt_dir() will write to tmp_path.
    Non-chat tests that don't call this fixture continue to use the real dirs.
    """
    from app.api import chat as chat_module

    audio_dir = tmp_path / "audio"
    stt_dir = audio_dir / "stt"
    audio_dir.mkdir(exist_ok=True)
    stt_dir.mkdir(exist_ok=True)

    monkeypatch.setattr(chat_module, "_AUDIO_DIR", audio_dir)
    monkeypatch.setattr(chat_module, "_STT_DIR", stt_dir)

    return audio_dir, stt_dir


# ─────────────────────────────────────────────────────────────────────────────
# FR-4: HTTP mock isolation
# ─────────────────────────────────────────────────────────────────────────────

# NOTE: Tests that manipulate os.environ (test_message_limit.py,
# test_combo_fallback.py, test_env_overrides.py) are responsible for their
# own cleanup. Conftest does not blanket-reset env vars because doing so
# can mask bugs rather than expose them.


# ─────────────────────────────────────────────────────────────────────────────
# Global test client (shared for non-async tests — each test gets a fresh
# session store via the _reset_session_store fixture above)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    """Synchronous TestClient for the FastAPI app."""
    from app.main import app
    return TestClient(app)
