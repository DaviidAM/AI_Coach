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
# FR-4: LLM mock isolation
# ─────────────────────────────────────────────────────────────────────────────

# Provide a default get_llm_reply mock for all tests that call the /api/chat
# endpoint.  Tests that need specific LLM responses can override this by
# patching get_llm_reply directly in their own test or fixture.
#
# This autouse fixture is intentionally a no-op — it just lets tests that
# don't patch get_llm_reply fall through without hitting a real HTTP call.
# Tests that DO patch get_llm_reply take precedence because the patch is
# applied after the autouse fixture's mock.
#
# NOTE: Tests that manipulate os.environ (test_message_limit.py,
# test_combo_fallback.py, test_env_overrides.py) are responsible for their
# own cleanup. Conftest does not blanket-reset env vars because doing so
# can mask bugs rather than expose them.


# NOTE: An earlier version of this conftest had an autouse `_mock_llm_http`
# fixture that patched app.llm.httpx.Client globally with a MockTransport
# returning a stub OpenAI-style response. That broke unrelated tests
# (e.g. test_stt_tts.py::TestTranscribe::test_transcribe_uses_base_model_cpu
# fell through to huggingface_hub which interpreted the stub payload as
# ModelInfo kwargs) because the MockTransport intercepted *every* httpx
# request, not only LLM calls.
#
# The fix is to NOT auto-mock the LLM. Tests that exercise /api/chat
# already patch what they need (app.api.chat.transcribe / .synthesize, or
# directly app.llm.get_llm_reply) on a per-test basis. If a future test
# genuinely needs a default LLM stub without explicit patching, add a
# NON-autouse fixture named e.g. `default_llm_stub` and request it in
# that one test only.


# ─────────────────────────────────────────────────────────────────────────────
# Global test client (shared for non-async tests — each test gets a fresh
# session store via the _reset_session_store fixture above)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    """Synchronous TestClient for the FastAPI app."""
    from app.main import app
    return TestClient(app)
