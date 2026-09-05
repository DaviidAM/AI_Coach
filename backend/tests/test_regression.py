"""
Regression tests for cherry-picked old Gradio logic.
Covers: error_type default, conversation summary, saved recordings.
"""
import pytest
import os
from pathlib import Path
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


# ─────────────────────────────────────────────────────────────────────────────
# Correction.error_type default
# ─────────────────────────────────────────────────────────────────────────────

class TestCorrectionErrorTypeDefault:
    def test_correction_defaults_to_general(self):
        """Correction Pydantic model should default error_type to 'general'."""
        from app.models import Correction
        c = Correction(
            original_phrase="I goed",
            corrected_phrase="I went",
            explanation="Use past simple.",
            error_level="A2",
            category="grammar",
        )
        assert c.error_type == "general"

    def test_correction_allows_explicit_error_type(self):
        """Correction should accept an explicit error_type value."""
        from app.models import Correction
        c = Correction(
            original_phrase="I goed",
            corrected_phrase="I went",
            explanation="Use past simple.",
            error_level="A2",
            category="grammar",
            error_type="vocabulary",
        )
        assert c.error_type == "vocabulary"


# ─────────────────────────────────────────────────────────────────────────────
# /api/conversation/summary
# ─────────────────────────────────────────────────────────────────────────────

class TestConversationSummary:
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


# ─────────────────────────────────────────────────────────────────────────────
# Saved recordings
# ─────────────────────────────────────────────────────────────────────────────

class TestSavedRecordings:
    def test_audio_chat_saves_original_recording(self):
        """When audio is sent, the raw recording should be saved to static/audio/stt/."""
        from app.api.chat import STT_DIR

        test_uuid_prefix = "test-recording-"
        expected_pattern = STT_DIR / f"{test_uuid_prefix}*.webm"

        # Build a minimal fake WAV to satisfy the audio content-type check
        fake_audio = b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00@\x1f\x00\x00d\x18\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"

        import uuid
        test_uuid = str(uuid.uuid4())

        with patch("app.api.chat.transcribe", return_value="Hello world"):
            with patch("app.api.chat.synthesize", new_callable=AsyncMock):
                response = client.post(
                    "/api/chat",
                    data={"session_id": f"test-recording-{test_uuid}"},
                    files={"audio": ("test.webm", fake_audio, "audio/webm")},
                )

        assert response.status_code == 200
        data = response.json()
        # The user_audio_url should point to the saved stt file
        assert data["user_audio_url"] is not None
        assert "/static/audio/stt/stt_" in data["user_audio_url"]

        # Verify the file actually exists on disk
        audio_url = data["user_audio_url"]
        # URL is like /static/audio/stt/stt_<uuid>.webm → relative path static/audio/stt/stt_<uuid>.webm
        rel_path = audio_url.lstrip("/")  # "static/audio/stt/stt_xxx.webm"
        audio_path = Path(rel_path)
        assert audio_path.exists(), f"Expected saved recording at {audio_path.resolve()}"
        # Clean up
        if audio_path.exists():
            audio_path.unlink()

    def test_text_chat_does_not_create_stt_file(self):
        """Text-only chat should not create anything under static/audio/stt/."""
        import uuid
        sid = f"test-text-only-{uuid.uuid4()}"
        with patch("app.api.chat.synthesize", new_callable=AsyncMock):
            response = client.post(
                "/api/chat",
                data={"text": "Hello, how are you?", "session_id": sid},
            )
        assert response.status_code == 200
        data = response.json()
        # user_audio_url should be None for text-only
        assert data["user_audio_url"] is None
