"""
Integration test for OmniRoute OpenAI-compatible path.

Uses unittest.mock.patch on httpx.Client inside app.llm so that the
internal _do_request() uses a fake response without making any network calls.

Acceptance criteria verified here:
- call_llm() with provider='omniroute' and response 200 OK returns the content string
- Test runs without any network I/O
"""
import json
import pytest
import httpx
from unittest.mock import patch, MagicMock

import sys
from pathlib import Path
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root))

from app.llm import call_llm, LLMError


def make_mock_response(body: dict, status_code: int = 200) -> httpx.Response:
    """Build a mock httpx.Response with an OpenAI-compatible body."""
    return httpx.Response(
        status_code=status_code,
        content=json.dumps(body).encode(),
        request=httpx.Request("POST", "http://localhost/chat/completions"),
    )


class TestOmniRouteIntegration:
    """Tests for the OpenAI-compatible provider path (omniroute, openai, groq)."""

    def test_omniroute_returns_content_on_200(self):
        """
        When OmniRoute returns 200 OK with a valid OpenAI-compatible body,
        call_llm must return the message content — not raise 'Unknown provider'.
        This is the core regression test for the missing-return bug.
        """
        response_body = {
            "choices": [
                {"message": {"role": "assistant", "content": "Hello! How can I help you today?"}}
            ],
            "model": "auto/best-chat",
        }
        mock_resp = make_mock_response(response_body)

        with patch("app.llm.httpx.Client") as mock_cls:
            mock_instance = mock_cls.return_value.__enter__.return_value
            mock_instance.post.return_value = mock_resp

            result = call_llm(
                messages=[{"role": "user", "content": "say hello"}],
                settings={"provider": "omniroute", "model": "auto/best-chat"},
            )

        assert result == "Hello! How can I help you today?"

    def test_omniroute_raises_llmerror_on_401(self):
        """When OmniRoute returns 401, LLMError must be raised with '401' in the message."""
        mock_resp = make_mock_response({"error": "Unauthorized"}, status_code=401)

        with patch("app.llm.httpx.Client") as mock_cls:
            mock_instance = mock_cls.return_value.__enter__.return_value
            mock_instance.post.return_value = mock_resp

            with pytest.raises(LLMError) as exc_info:
                call_llm(
                    messages=[{"role": "user", "content": "hi"}],
                    settings={"provider": "omniroute", "model": "auto/best-chat"},
                )
            assert "401" in str(exc_info.value)

    def test_omniroute_falls_back_on_401_with_custom_combo(self):
        """
        When OmniRoute returns 401 on a non-fallback model (e.g. 'my-combo'),
        it must retry with OMNIROUTE_DEFAULT_COMBO_FALLBACK ('primary-chain')
        before raising.
        """
        responses = [
            make_mock_response({"error": "Unauthorized"}, status_code=401),  # first call
            make_mock_response({                               # second call (fallback)
                "choices": [{"message": {"role": "assistant", "content": "Fallback reply"}}]
            }),
        ]
        mock_resp_iter = iter(responses)

        with patch("app.llm.httpx.Client") as mock_cls:
            mock_instance = mock_cls.return_value.__enter__.return_value
            mock_instance.post.side_effect = lambda *args, **kwargs: next(mock_resp_iter)

            result = call_llm(
                messages=[{"role": "user", "content": "hi"}],
                settings={"provider": "omniroute", "model": "my-custom-combo"},
            )

        assert result == "Fallback reply"

    def test_openai_returns_content_on_200(self):
        """provider='openai' shares the same code path — verify it also works."""
        response_body = {
            "choices": [{"message": {"role": "assistant", "content": "OpenAI reply"}}],
            "model": "gpt-4o-mini",
        }
        mock_resp = make_mock_response(response_body)

        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
            with patch("app.llm.httpx.Client") as mock_cls:
                mock_instance = mock_cls.return_value.__enter__.return_value
                mock_instance.post.return_value = mock_resp

                result = call_llm(
                    messages=[{"role": "user", "content": "hello"}],
                    settings={"provider": "openai", "model": "gpt-4o-mini"},
                )

        assert result == "OpenAI reply"

    def test_groq_returns_content_on_200(self):
        """provider='groq' shares the same code path — verify it also works."""
        response_body = {
            "choices": [{"message": {"role": "assistant", "content": "Groq reply"}}],
            "model": "llama-3.1-8b-instant",
        }
        mock_resp = make_mock_response(response_body)

        with patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
            with patch("app.llm.httpx.Client") as mock_cls:
                mock_instance = mock_cls.return_value.__enter__.return_value
                mock_instance.post.return_value = mock_resp

                result = call_llm(
                    messages=[{"role": "user", "content": "hello"}],
                    settings={"provider": "groq", "model": "llama-3.1-8b-instant"},
                )

        assert result == "Groq reply"

    def test_sse_data_prefix_is_stripped(self):
        """
        If OmniRoute returns a 'data:' SSE prefix (some gateways leak it),
        the code must strip it and still return the parsed content.
        """
        sse_text = 'data:{"choices":[{"message":{"role":"assistant","content":"SSE reply"}}]}\n\n'
        mock_resp = httpx.Response(
            status_code=200,
            content=sse_text.encode(),
            request=httpx.Request("POST", "http://localhost/chat/completions"),
        )

        with patch("app.llm.httpx.Client") as mock_cls:
            mock_instance = mock_cls.return_value.__enter__.return_value
            mock_instance.post.return_value = mock_resp

            result = call_llm(
                messages=[{"role": "user", "content": "hello"}],
                settings={"provider": "omniroute", "model": "auto/best-chat"},
            )

        assert result == "SSE reply"
