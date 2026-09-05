"""
Regression tests for the /api/settings endpoint (POST and GET).
Covers round-trip, unknown provider, fallback header, and session isolation.
"""
import os
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def _random_sid():
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/settings — round-trip with GET
# ─────────────────────────────────────────────────────────────────────────────

class TestSettingsSetAndGet:
    def test_settings_set_and_get(self):
        """POST a setting then GET it — response body must match."""
        sid = _random_sid()
        payload = {"session_id": sid, "provider": "minimax", "model": "MiniMax-Text-01"}

        post_resp = client.post("/api/settings", json=payload)
        assert post_resp.status_code == 200, post_resp.text
        post_data = post_resp.json()
        assert post_data["provider"] == "minimax"
        assert post_data["model"] == "MiniMax-Text-01"

        get_resp = client.get(f"/api/settings?session_id={sid}")
        assert get_resp.status_code == 200, get_resp.text
        get_data = get_resp.json()
        assert get_data["provider"] == "minimax"
        assert get_data["model"] == "MiniMax-Text-01"

        assert get_data == post_data

    def test_settings_set_different_provider(self):
        """Settings with a different valid provider round-trips correctly."""
        sid = _random_sid()
        payload = {"session_id": sid, "provider": "openai", "model": "gpt-4o-mini"}

        post_resp = client.post("/api/settings", json=payload)
        assert post_resp.status_code == 200, post_resp.text

        get_resp = client.get(f"/api/settings?session_id={sid}")
        assert get_resp.status_code == 200
        get_data = get_resp.json()
        assert get_data["provider"] == "openai"
        assert get_data["model"] == "gpt-4o-mini"


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/settings — unknown provider
# ─────────────────────────────────────────────────────────────────────────────

class TestSettingsUnknownProvider:
    def test_settings_unknown_provider(self):
        """POST with an unknown provider must return 422."""
        sid = _random_sid()
        payload = {"session_id": sid, "provider": "nonexistent", "model": "does-not-exist"}

        resp = client.post("/api/settings", json=payload)
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "Unknown provider" in data.get("detail", "")


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/settings — X-Fallback header when MINIMAX_API_KEY is unset
# ─────────────────────────────────────────────────────────────────────────────

class TestSettingsFallbackHeader:
    def test_settings_fallback_header(self):
        """
        When MINIMAX_API_KEY is not set and the provider is 'minimax',
        POST /api/settings returns 200 with an X-Fallback header.
        """
        # Temporarily remove MINIMAX_API_KEY from the environment
        api_key_backup = os.environ.pop("MINIMAX_API_KEY", None)
        try:
            sid = _random_sid()
            payload = {"session_id": sid, "provider": "minimax", "model": "MiniMax-Text-01"}

            resp = client.post("/api/settings", json=payload)
            assert resp.status_code == 200, resp.text
            assert "X-Fallback" in resp.headers, (
                f"Expected X-Fallback header when API key is unset. Headers: {resp.headers}"
            )
            assert "MINIMAX_API_KEY" in resp.headers["X-Fallback"]
        finally:
            # Restore original value
            if api_key_backup is not None:
                os.environ["MINIMAX_API_KEY"] = api_key_backup


# ─────────────────────────────────────────────────────────────────────────────
# Session isolation
# ─────────────────────────────────────────────────────────────────────────────

class TestSettingsSessionIsolation:
    def test_settings_session_isolation(self):
        """
        Settings set for session A must not leak into session B.
        Each session keeps its own {provider, model}.
        """
        sid_a = _random_sid()
        sid_b = _random_sid()

        # Set different providers for each session
        client.post("/api/settings", json={
            "session_id": sid_a,
            "provider": "minimax",
            "model": "MiniMax-Text-01",
        })
        client.post("/api/settings", json={
            "session_id": sid_b,
            "provider": "openai",
            "model": "gpt-4o-mini",
        })

        # Read both sessions
        resp_a = client.get(f"/api/settings?session_id={sid_a}")
        resp_b = client.get(f"/api/settings?session_id={sid_b}")

        assert resp_a.status_code == 200
        assert resp_b.status_code == 200

        data_a = resp_a.json()
        data_b = resp_b.json()

        assert data_a["provider"] == "minimax"
        assert data_a["model"] == "MiniMax-Text-01"
        assert data_b["provider"] == "openai"
        assert data_b["model"] == "gpt-4o-mini"

        # Confirm they are different — not cross-contaminated
        assert data_a != data_b
