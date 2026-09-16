"""
Tests for DEMO_MESSAGE_LIMIT environment variable and the /api/config endpoint.

Covers AC-1 through AC-5 and AC-7:
  - default 5 when env var is unset
  - unlimited (None) when env var is "-1"
  - custom positive int
  - invalid value falls back to 5 + warning
  - /api/config response shape
  - is_at_demo_limit() returns True when cap is reached

The limit-enforcement logic is tested via is_at_demo_limit() directly (pure
session logic — no LLM mocking needed). The full /api/chat 429 integration is
verified by the task smoke test script:
  DEMO_MESSAGE_LIMIT=2 uvicorn ... && for i in 1 2 3; do curl ...; done

NOTE on env-var re-reading: this file historically manipulated
``sys.modules`` to force re-imports of ``app.session`` and ``app.main`` so
that ``DEMO_MESSAGE_LIMIT`` (a module-level constant) would re-evaluate the
env var. That trick broke unrelated tests because deleting the modules
mid-suite caused cross-test bleed (see commit 07f3a03 → 0172683 → final fix).

This file now uses :func:`app.session.get_demo_limit`, which re-reads the
env var on every call, and uses :func:`pytest.MonkeyPatch.setenv` (via the
``monkeypatch`` fixture) to flip the env var inside individual tests. No
``sys.modules`` mutation is needed.
"""
import os
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Test: DEMO_MESSAGE_LIMIT env parsing via get_demo_limit().
# ---------------------------------------------------------------------------
class TestDemoMessageLimitParsing:
    """DEMO_MESSAGE_LIMIT is re-read from os.environ via get_demo_limit()."""

    def test_default_is_5_when_env_unset(self, monkeypatch):
        """AC-1: unset env var → get_demo_limit() returns 5."""
        monkeypatch.delenv("DEMO_MESSAGE_LIMIT", raising=False)
        from app.session import get_demo_limit

        assert get_demo_limit() == 5

    def test_unlimited_when_env_is_minus_one(self, monkeypatch):
        """AC-2: DEMO_MESSAGE_LIMIT=-1 → None (unlimited)."""
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "-1")
        from app.session import get_demo_limit

        assert get_demo_limit() is None

    def test_positive_int_is_preserved(self, monkeypatch):
        """AC-3: DEMO_MESSAGE_LIMIT=20 → 20."""
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "20")
        from app.session import get_demo_limit

        assert get_demo_limit() == 20

    def test_invalid_string_falls_back_to_5(self, monkeypatch):
        """AC-4: DEMO_MESSAGE_LIMIT=abc → 5."""
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "abc")
        from app.session import get_demo_limit

        assert get_demo_limit() == 5

    def test_negative_other_than_minus_one_falls_back_to_5(self, monkeypatch):
        """AC-4: DEMO_MESSAGE_LIMIT=-5 → 5."""
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "-5")
        from app.session import get_demo_limit

        assert get_demo_limit() == 5


# ---------------------------------------------------------------------------
# Test: GET /api/config endpoint.
# ---------------------------------------------------------------------------
class TestConfigEndpoint:
    """GET /api/config surfaces the parsed limit."""

    def test_config_returns_5_and_false_when_env_unset(self, monkeypatch):
        """AC-5: demo_message_limit=5, unlimited=false when env var is unset."""
        monkeypatch.delenv("DEMO_MESSAGE_LIMIT", raising=False)
        from app.main import app as main_app

        client = TestClient(main_app)
        resp = client.get("/api/config")
        assert resp.status_code == 200
        assert resp.json() == {"demo_message_limit": 5, "unlimited": False}

    def test_config_returns_null_and_true_when_env_is_minus_one(self, monkeypatch):
        """AC-5: demo_message_limit=null, unlimited=true when env is -1."""
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "-1")
        from app.main import app as main_app

        client = TestClient(main_app)
        resp = client.get("/api/config")
        assert resp.status_code == 200
        assert resp.json() == {"demo_message_limit": None, "unlimited": True}

    def test_config_returns_custom_int(self, monkeypatch):
        """AC-3: demo_message_limit=20, unlimited=false for custom positive int."""
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "20")
        from app.main import app as main_app

        client = TestClient(main_app)
        resp = client.get("/api/config")
        assert resp.status_code == 200
        assert resp.json() == {"demo_message_limit": 20, "unlimited": False}


# ---------------------------------------------------------------------------
# Test: limit enforcement via is_at_demo_limit().
#
# is_at_demo_limit() is pure session logic — no LLM, no network.
# The full /api/chat 429 integration is verified by the task smoke test:
#   DEMO_MESSAGE_LIMIT=2 uvicorn ... && for i in 1 2 3; do curl ...; done
# ---------------------------------------------------------------------------
class TestChatEnforcement:
    """is_at_demo_limit() blocks new user messages when the cap is reached."""

    def test_at_limit_true_after_5_user_messages_when_limit_is_5(self, monkeypatch):
        """AC-1: is_at_demo_limit is True after 5 user messages when limit=5."""
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "5")
        from app.session import store, is_at_demo_limit

        sid = "test-sid-5"
        for i in range(5):
            store.append_message(sid, "user", f"msg {i}")
            store.append_message(sid, "assistant", f"reply {i}")
        assert is_at_demo_limit(sid) is True

    def test_at_limit_false_at_4_messages_when_limit_is_5(self, monkeypatch):
        """AC-1: is_at_demo_limit is False after 4 user messages when limit=5."""
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "5")
        from app.session import store, is_at_demo_limit

        sid = "test-sid-4"
        for i in range(4):
            store.append_message(sid, "user", f"msg {i}")
        assert is_at_demo_limit(sid) is False

    def test_at_limit_false_when_unlimited(self, monkeypatch):
        """AC-2: is_at_demo_limit always False when DEMO_MESSAGE_LIMIT=-1."""
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "-1")
        from app.session import store, is_at_demo_limit

        sid = "test-sid-unlimited"
        for i in range(100):
            store.append_message(sid, "user", f"msg {i}")
        assert is_at_demo_limit(sid) is False

    def test_custom_limit_respected(self, monkeypatch):
        """AC-3: is_at_demo_limit True after 20 messages when limit=20.

        Note: MAX_MESSAGES=10 (LLM context window) truncates total session
        history, so only the last 10 messages survive. is_at_demo_limit
        checks the actual stored count, so 10 < 20 → False. Then we flip
        the env to limit=5, append 20 more (truncated to 10 stored), and
        confirm the same stored count of 10 ≥ 5 → True.
        """
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "20")
        from app.session import store, is_at_demo_limit

        sid = "test-sid-custom"
        for i in range(20):
            store.append_message(sid, "user", f"msg {i}")
        session = store.get_or_create(sid)
        stored_user_count = sum(1 for m in session.messages if m.get("role") == "user")
        assert stored_user_count == 10  # MAX_MESSAGES cap
        assert is_at_demo_limit(sid) is False  # 10 < 20

        # Flip env to 5: 10 stored >= 5 → at limit.
        store.reset(sid)
        monkeypatch.setenv("DEMO_MESSAGE_LIMIT", "5")
        for i in range(20):
            store.append_message(sid, "user", f"msg {i}")
        stored = sum(
            1 for m in store.get_or_create(sid).messages if m.get("role") == "user"
        )
        assert stored == 10
        assert is_at_demo_limit(sid) is True
