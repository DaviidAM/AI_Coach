"""
Tests for OmniRoute combo fallback logic.

When an OmniRoute request returns 401 or 404 for a custom combo name,
the call must automatically retry with OMNIROUTE_DEFAULT_COMBO_FALLBACK
before propagating the error.
"""
import uuid
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def _random_sid():
    return str(uuid.uuid4())


class TestComboFallback:
    """OmniRoute combo fallback: 401/404 on custom combo → fallback combo."""

    def test_custom_combo_401_falls_back_to_fallback(self):
        """
        When OmniRoute returns 401 for a custom combo model,
        the system must retry with OMNIROUTE_DEFAULT_COMBO_FALLBACK
        and succeed with that fallback.
        """
        sid = _random_sid()
        custom_model = "my-custom-combo"
        fallback_model = "primary-chain"

        # Set session to custom combo
        client.post("/api/settings", json={
            "session_id": sid,
            "provider": "omniroute",
            "model": custom_model,
        })

        call_count = {"total": 0, "fallback_used": False}

        def mock_post(url, **kwargs):
            call_count["total"] += 1
            model_sent = kwargs.get("json", {}).get("model", "")

            import httpx
            # First call: 401 for custom combo
            if model_sent == custom_model and call_count["total"] == 1:
                resp = MagicMock()
                resp.status_code = 401
                resp.text = "Unauthorized"
                resp.headers = {}
                resp.json = lambda: {}
                return resp
            # Second call: 200 for fallback combo
            if model_sent == fallback_model:
                call_count["fallback_used"] = True
                resp = MagicMock()
                resp.status_code = 200
                resp.text = '{"choices":[{"message":{"content":"{\\"reply\\":\\"test\\",\\"corrections\\":[]}"}}]}'
                resp.headers = {}
                resp.json = lambda: {
                    "choices": [{"message": {"content": '{"reply":"test","corrections":[]}'}}]
                }
                return resp
            # Unexpected call
            resp = MagicMock()
            resp.status_code = 999
            resp.text = "Unexpected"
            resp.headers = {}
            resp.json = lambda: {}
            return resp

        import os as _os
        fallback_backup = _os.environ.pop("OMNIROUTE_DEFAULT_COMBO_FALLBACK", None)
        try:
            _os.environ["OMNIROUTE_DEFAULT_COMBO_FALLBACK"] = fallback_model
            with patch("httpx.Client") as mock_client_cls:
                mock_instance = MagicMock()
                mock_instance.post = mock_post
                mock_instance.__enter__ = MagicMock(return_value=mock_instance)
                mock_instance.__exit__ = MagicMock(return_value=False)
                mock_client_cls.return_value = mock_instance

                resp = client.post("/api/chat", data={
                    "session_id": sid,
                    "text": "Hello",
                })
            # If fallback was triggered, we should see 200 (fallback succeeded)
            assert call_count["fallback_used"], (
                f"Expected fallback to be triggered after 401, but it wasn't. "
                f"Calls made: {call_count['total']}"
            )
        finally:
            if fallback_backup is None:
                _os.environ.pop("OMNIROUTE_DEFAULT_COMBO_FALLBACK", None)
            else:
                _os.environ["OMNIROUTE_DEFAULT_COMBO_FALLBACK"] = fallback_backup

    def test_custom_combo_404_falls_back_to_fallback(self):
        """
        When OmniRoute returns 404 for a custom combo model,
        the system must retry with OMNIROUTE_DEFAULT_COMBO_FALLBACK.
        """
        sid = _random_sid()
        custom_model = "nonexistent-combo"
        fallback_model = "primary-chain"

        client.post("/api/settings", json={
            "session_id": sid,
            "provider": "omniroute",
            "model": custom_model,
        })

        call_count = {"total": 0, "fallback_used": False}

        def mock_post(url, **kwargs):
            call_count["total"] += 1
            model_sent = kwargs.get("json", {}).get("model", "")

            import httpx
            if model_sent == custom_model and call_count["total"] == 1:
                resp = MagicMock()
                resp.status_code = 404
                resp.text = "Not Found"
                resp.headers = {}
                resp.json = lambda: {}
                return resp
            if model_sent == fallback_model:
                call_count["fallback_used"] = True
                resp = MagicMock()
                resp.status_code = 200
                resp.text = '{"choices":[{"message":{"content":"{\\"reply\\":\\"test\\",\\"corrections\\":[]}"}}]}'
                resp.headers = {}
                resp.json = lambda: {
                    "choices": [{"message": {"content": '{"reply":"test","corrections":[]}'}}]
                }
                return resp
            resp = MagicMock()
            resp.status_code = 999
            resp.text = "Unexpected"
            resp.headers = {}
            resp.json = lambda: {}
            return resp

        import os as _os
        fallback_backup = _os.environ.pop("OMNIROUTE_DEFAULT_COMBO_FALLBACK", None)
        try:
            _os.environ["OMNIROUTE_DEFAULT_COMBO_FALLBACK"] = fallback_model
            with patch("httpx.Client") as mock_client_cls:
                mock_instance = MagicMock()
                mock_instance.post = mock_post
                mock_instance.__enter__ = MagicMock(return_value=mock_instance)
                mock_instance.__exit__ = MagicMock(return_value=False)
                mock_client_cls.return_value = mock_instance

                resp = client.post("/api/chat", data={
                    "session_id": sid,
                    "text": "Hello",
                })
            assert call_count["fallback_used"], (
                f"Expected fallback to be triggered after 404, but it wasn't. "
                f"Calls made: {call_count['total']}"
            )
        finally:
            if fallback_backup is None:
                _os.environ.pop("OMNIROUTE_DEFAULT_COMBO_FALLBACK", None)
            else:
                _os.environ["OMNIROUTE_DEFAULT_COMBO_FALLBACK"] = fallback_backup


