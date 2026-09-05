import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


class TestSummaryEndpoint:
    def test_summary_empty_history_returns_placeholder(self):
        """When there is no conversation history, summary returns a placeholder."""
        with patch("app.llm.get_llm_reply") as mock_llm:
            mock_llm.return_value = {"reply": "Anything", "corrections": []}
            # Use a fresh session_id that has no history
            response = client.get("/api/conversation/summary?session_id=no-such-session")
            assert response.status_code == 200
            # New session has no history → summarize_conversation returns placeholder
            assert "No conversation to summarize yet" in response.json()["summary"]

    def test_summarize_conversation_function_empty(self):
        """summarize_conversation returns placeholder for empty history."""
        from app.llm import summarize_conversation
        result = summarize_conversation("B1", [])
        assert result == "No conversation to summarize yet."

    def test_summarize_conversation_function_with_history(self):
        """summarize_conversation calls LLM and returns the reply text."""
        from app.llm import summarize_conversation
        history = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there! How are you?"},
        ]
        with patch("app.llm.get_llm_reply") as mock:
            mock.return_value = {"reply": "The conversation covered greetings.", "corrections": []}
            result = summarize_conversation("B1", history)
            assert result == "The conversation covered greetings."
            mock.assert_called_once()

    def test_summarize_conversation_llm_error_returns_fallback(self):
        """summarize_conversation returns a fallback string on LLM error."""
        from app.llm import summarize_conversation, LLMError
        history = [{"role": "user", "content": "Hello"}]
        with patch("app.llm.get_llm_reply") as mock:
            mock.side_effect = LLMError("boom")
            result = summarize_conversation("B1", history)
            assert result == "Unable to generate summary."
