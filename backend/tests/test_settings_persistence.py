"""
Tests that POST /api/settings persists model changes in the session store
and that subsequent calls reflect those changes (new session isolation,
model change persists within a session).
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def _random_sid():
    return str(uuid.uuid4())


class TestSettingsPersistence:
    """POST /settings must persist model changes across calls."""

    def test_settings_persist_model_change(self):
        """
        POST /api/settings with a new model value; then GET /api/settings.
        The stored model must reflect the posted value, not the default.
        """
        sid = _random_sid()
        custom_model = "my-custom-combo-xyz"

        post_resp = client.post("/api/settings", json={
            "session_id": sid,
            "provider": "omniroute",
            "model": custom_model,
        })
        assert post_resp.status_code == 200, post_resp.text

        get_resp = client.get(f"/api/settings?session_id={sid}")
        assert get_resp.status_code == 200, get_resp.text
        data = get_resp.json()
        assert data["model"] == custom_model, (
            f"Expected model={custom_model!r}, got {data['model']!r}. "
            "Settings were not persisted after POST."
        )

    def test_settings_persist_provider_and_model_together(self):
        """
        Both provider and model must persist together.
        """
        sid = _random_sid()
        payload = {
            "session_id": sid,
            "provider": "omniroute",
            "model": "demo-combo",
        }

        post_resp = client.post("/api/settings", json=payload)
        assert post_resp.status_code == 200, post_resp.text

        get_resp = client.get(f"/api/settings?session_id={sid}")
        get_data = get_resp.json()
        assert get_data["provider"] == "omniroute"
        assert get_data["model"] == "demo-combo"

    def test_settings_different_sessions_independent(self):
        """
        Changing settings for session A must not affect session B.
        """
        sid_a = _random_sid()
        sid_b = _random_sid()

        client.post("/api/settings", json={
            "session_id": sid_a,
            "provider": "omniroute",
            "model": "combo-a",
        })
        client.post("/api/settings", json={
            "session_id": sid_b,
            "provider": "omniroute",
            "model": "combo-b",
        })

        data_a = client.get(f"/api/settings?session_id={sid_a}").json()
        data_b = client.get(f"/api/settings?session_id={sid_b}").json()

        assert data_a["model"] == "combo-a"
        assert data_b["model"] == "combo-b"
        assert data_a["model"] != data_b["model"]

    def test_new_session_uses_default_model(self):
        """
        A brand-new session (never called POST /settings) must still
        return a valid default model (auto/best-chat or the env override).
        This verifies that session initialisation reads from the env-backed default.
        """
        sid = _random_sid()

        resp = client.get(f"/api/settings?session_id={sid}")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        # New session must have a model — it comes from DEFAULT_SETTINGS
        assert "model" in data
        assert data["model"] == "auto/best-chat"
