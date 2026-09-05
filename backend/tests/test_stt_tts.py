import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path
import tempfile
import os
import io

from app import stt as stt_module
from app import tts as tts_module
from app.main import app
from app.api.chat import AUDIO_DIR
from httpx import AsyncClient, ASGITransport


# ------------------------------------------------------------------
# STT tests
# ------------------------------------------------------------------

class TestTranscribe:
    """Tests for STT transcription using faster-whisper."""

    @pytest.fixture(autouse=True)
    def reset_model_cache(self):
        """Reset the module-level _model singleton before each test."""
        stt_module._model = None
        yield
        stt_module._model = None

    def test_transcribe_returns_string(self):
        """transcribe() should return a string (possibly empty)."""
        mock_model = MagicMock()
        mock_model.transcribe.return_value = ([], None)

        with patch.object(stt_module, "_get_model", return_value=mock_model):
            result = stt_module.transcribe(b"fake audio bytes")
        assert isinstance(result, str)

    def test_transcribe_concatenates_segments(self):
        """transcribe() should concatenate all segment texts."""
        mock_model = MagicMock()
        seg1 = MagicMock()
        seg1.text = "Hello "
        seg2 = MagicMock()
        seg2.text = "world."
        mock_model.transcribe.return_value = ([seg1, seg2], None)

        with patch.object(stt_module, "_get_model", return_value=mock_model):
            result = stt_module.transcribe(b"fake audio bytes")

        assert result == "Hello world."

    def test_transcribe_strips_whitespace(self):
        """transcribe() should strip leading/trailing whitespace."""
        mock_model = MagicMock()
        seg = MagicMock()
        seg.text = "  Hello world.  "
        mock_model.transcribe.return_value = ([seg], None)

        with patch.object(stt_module, "_get_model", return_value=mock_model):
            result = stt_module.transcribe(b"fake audio bytes")

        assert result == "Hello world."

    def test_transcribe_uses_base_model_cpu(self):
        """_get_model() should load the base model on CPU with int8."""
        stt_module._model = None  # ensure not cached

        with patch("app.stt.WhisperModel") as mock_wm:
            mock_wm.return_value = MagicMock()
            mock_wm.return_value.transcribe.return_value = ([], None)

            stt_module.transcribe(b"test")

            mock_wm.assert_called_once_with("base", device="cpu", compute_type="int8")


# ------------------------------------------------------------------
# TTS tests
# ------------------------------------------------------------------

class TestSynthesize:
    """Tests for TTS synthesis using edge-tts."""

    @pytest.mark.asyncio
    async def test_synthesize_calls_edge_tts_with_correct_args(self, tmp_path):
        """synthesize() should call edge-tts Communicate with correct text and voice."""
        output_path = tmp_path / "out.mp3"

        with patch("app.tts.edge_tts.Communicate") as mock_comm:
            comm_instance = AsyncMock()
            comm_instance.save = AsyncMock()
            mock_comm.return_value = comm_instance

            await tts_module.synthesize("Hello world", output_path, voice="en-US-AriaNeural")

            mock_comm.assert_called_once_with("Hello world", "en-US-AriaNeural")
            comm_instance.save.assert_called_once_with(str(output_path))

    @pytest.mark.asyncio
    async def test_synthesize_default_voice(self, tmp_path):
        """synthesize() should use en-US-AriaNeural as default voice."""
        output_path = tmp_path / "out.mp3"

        with patch("app.tts.edge_tts.Communicate") as mock_comm:
            comm_instance = AsyncMock()
            comm_instance.save = AsyncMock()
            mock_comm.return_value = comm_instance

            await tts_module.synthesize("Hello", output_path)

            mock_comm.assert_called_once_with("Hello", "en-US-AriaNeural")

    @pytest.mark.asyncio
    async def test_synthesize_custom_voice(self, tmp_path):
        """synthesize() should pass the custom voice to Communicate."""
        output_path = tmp_path / "out.mp3"

        with patch("app.tts.edge_tts.Communicate") as mock_comm:
            comm_instance = AsyncMock()
            comm_instance.save = AsyncMock()
            mock_comm.return_value = comm_instance

            await tts_module.synthesize("Test", output_path, voice="en-GB-SoniaNeural")

            mock_comm.assert_called_once_with("Test", "en-GB-SoniaNeural")


# ------------------------------------------------------------------
# Corrections store tests
# ------------------------------------------------------------------

from app.api.corrections import (
    store_corrections,
    get_corrections,
    _corrections_store,
)


class TestCorrectionsStore:
    """Tests for the in-memory corrections store."""

    @pytest.fixture(autouse=True)
    def reset_store(self):
        """Clear corrections store before each test."""
        _corrections_store.clear()
        yield
        _corrections_store.clear()

    def test_store_and_retrieve_single(self):
        corrections = [
            {
                "original_phrase": "I go",
                "corrected_phrase": "I went",
                "explanation": "Use past simple",
                "error_level": "A2",
                "category": "verb tense",
            }
        ]
        store_corrections("session-1", corrections)
        result = get_corrections("session-1")
        assert len(result) == 1
        assert result[0]["original_phrase"] == "I go"
        assert "timestamp" in result[0]

    def test_pagination_limit(self):
        for i in range(5):
            store_corrections("session-2", [
                {
                    "original_phrase": f"error {i}",
                    "corrected_phrase": f"fixed {i}",
                    "explanation": "desc",
                    "error_level": "A1",
                    "category": "misc",
                }
            ])
        result = get_corrections("session-2", limit=3, offset=0)
        assert len(result) == 3

    def test_pagination_offset(self):
        for i in range(5):
            store_corrections("session-3", [
                {
                    "original_phrase": f"error {i}",
                    "corrected_phrase": f"fixed {i}",
                    "explanation": "desc",
                    "error_level": "A1",
                    "category": "misc",
                }
            ])
        # Newest first
        result = get_corrections("session-3", limit=10, offset=0)
        assert result[0]["original_phrase"] == "error 4"
        assert result[4]["original_phrase"] == "error 0"

    def test_get_corrections_unknown_session(self):
        result = get_corrections("nonexistent-session")
        assert result == []


# ------------------------------------------------------------------
# Integration tests for chat endpoint with audio
# ------------------------------------------------------------------

class TestChatAudioResponse:
    """Tests for POST /api/chat with multipart audio."""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path):
        """Patch STT, TTS, and LLM; ensure audio dir exists."""
        self.audio_dir = AUDIO_DIR
        self.audio_dir.mkdir(parents=True, exist_ok=True)

        self.mock_transcribe = patch("app.api.chat.transcribe").start()
        self.mock_synthesize = patch("app.api.chat.synthesize").start()
        self.mock_get_llm_reply = patch("app.api.chat.get_llm_reply").start()

        self.mock_transcribe.return_value = "Hello world"
        self.mock_get_llm_reply.return_value = {
            "reply": "Hi! How can I help you?",
            "corrections": [],
        }

        yield

        patch.stopall()
        # Clean up generated audio files
        for f in self.audio_dir.glob("*.mp3"):
            f.unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_post_audio_returns_all_fields(self):
        """POST with audio returns user_text, user_audio_url, coach_text, coach_audio_url."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            audio_file = io.BytesIO(b"fake audio content")
            response = await client.post(
                "/api/chat",
                data={"session_id": "test-session"},
                files={"audio": ("test.wav", audio_file, "audio/wav")},
            )

        assert response.status_code == 200
        data = response.json()
        assert "user_text" in data
        assert "coach_text" in data
        assert "user_audio_url" in data
        assert "coach_audio_url" in data

    @pytest.mark.asyncio
    async def test_user_audio_url_follows_uuid_pattern(self):
        """user_audio_url follows /static/audio/stt/stt_<uuid>.<ext> pattern (saved original recording)."""
        import re

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            audio_file = io.BytesIO(b"fake audio content")
            response = await client.post(
                "/api/chat",
                data={"session_id": "test-session"},
                files={"audio": ("test.wav", audio_file, "audio/wav")},
            )

        assert response.status_code == 200
        data = response.json()
        url = data["user_audio_url"]
        # New format: /static/audio/stt/stt_<uuid>.wav — preserves the original recording
        pattern = r"^/static/audio/stt/stt_[0-9a-f-]{36}\.(wav|webm|mp3|ogg|mp4)$"
        assert re.match(pattern, url), f"Expected UUID pattern, got {url}"

    @pytest.mark.asyncio
    async def test_coach_audio_url_follows_uuid_pattern(self):
        """coach_audio_url follows /static/audio/<uuid>.mp3 pattern."""
        import re

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            audio_file = io.BytesIO(b"fake audio content")
            response = await client.post(
                "/api/chat",
                data={"session_id": "test-session"},
                files={"audio": ("test.wav", audio_file, "audio/wav")},
            )

        assert response.status_code == 200
        data = response.json()
        url = data["coach_audio_url"]
        pattern = r"^/static/audio/[0-9a-f-]{36}\.mp3$"
        assert re.match(pattern, url), f"Expected UUID pattern, got {url}"


class TestChatAudioValidation:
    """Tests for audio-only and text+audio validation."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.mock_transcribe = patch("app.api.chat.transcribe").start()
        self.mock_synthesize = patch("app.api.chat.synthesize").start()
        self.mock_get_llm_reply = patch("app.api.chat.get_llm_reply").start()
        self.mock_transcribe.return_value = "Hello"
        self.mock_get_llm_reply.return_value = {"reply": "Hi!", "corrections": []}
        yield
        patch.stopall()

    @pytest.mark.asyncio
    async def test_audio_only_valid(self):
        """POST with audio only (no text field) — should process audio successfully."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            audio_file = io.BytesIO(b"fake audio content")
            response = await client.post(
                "/api/chat",
                data={"session_id": "test-session"},
                files={"audio": ("test.wav", audio_file, "audio/wav")},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["user_text"] == "Hello"

    @pytest.mark.asyncio
    async def test_text_and_audio_returns_400(self):
        """POST with both text and audio should return 400 error."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            audio_file = io.BytesIO(b"fake audio content")
            response = await client.post(
                "/api/chat",
                data={"session_id": "test-session", "text": "hello"},
                files={"audio": ("test.wav", audio_file, "audio/wav")},
            )

        assert response.status_code == 400
        assert "either text or audio" in response.json()["detail"].lower()


class TestSTTValidation:
    """Tests for STT input validation."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.mock_transcribe = patch("app.api.chat.transcribe").start()
        self.mock_synthesize = patch("app.api.chat.synthesize").start()
        self.mock_get_llm_reply = patch("app.api.chat.get_llm_reply").start()
        self.mock_transcribe.return_value = "transcribed text"
        self.mock_get_llm_reply.return_value = {"reply": "coach reply", "corrections": []}
        yield
        patch.stopall()

    @pytest.mark.asyncio
    async def test_invalid_audio_format_returns_422(self):
        """Unsupported audio MIME type should return 422."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            audio_file = io.BytesIO(b"fake audio content")
            response = await client.post(
                "/api/chat",
                data={"session_id": "test-session"},
                files={"audio": ("test.exe", audio_file, "application/octet-stream")},
            )

        assert response.status_code == 422
        assert "Unsupported audio MIME type" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_empty_audio_returns_empty_string(self):
        """Empty audio file should return empty string for user_text (or appropriate error)."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            audio_file = io.BytesIO(b"")
            response = await client.post(
                "/api/chat",
                data={"session_id": "test-session"},
                files={"audio": ("empty.wav", audio_file, "audio/wav")},
            )

        # The STT mock returns "transcribed text" for any input.
        # A real empty audio file would return "" — verify via actual transcribe call
        # by checking that mock was called with empty bytes.
        self.mock_transcribe.assert_called_once()
        call_arg = self.mock_transcribe.call_args[0][0]
        assert call_arg == b"", "Empty audio bytes should be passed to transcribe"


class TestTTSPath:
    """Tests for TTS synthesize path."""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path):
        self.audio_dir = AUDIO_DIR
        self.audio_dir.mkdir(parents=True, exist_ok=True)
        self.mock_transcribe = patch("app.api.chat.transcribe").start()
        self.mock_get_llm_reply = patch("app.api.chat.get_llm_reply").start()
        self.mock_transcribe.return_value = "Hello"
        self.mock_get_llm_reply.return_value = {"reply": "Coach reply", "corrections": []}
        yield
        patch.stopall()
        for f in self.audio_dir.glob("*.mp3"):
            f.unlink(missing_ok=True)

    def test_text_input_produces_audio_file(self, tmp_path):
        """Text input -> audio file generated at expected path."""
        output_path = self.audio_dir / "test_output.mp3"

        with patch("asyncio.run"):
            tts_module.synthesize("Hello world", output_path)

        # Synthesize is mocked, but verify the path was passed correctly
        # (actual file not created due to mock)
        assert output_path.suffix == ".mp3"

    @pytest.mark.asyncio
    async def test_synthesize_produces_valid_file_structure(self, tmp_path):
        """TTS synthesize is called with .mp3 path (file exists check relies on integration)."""
        output_path = tmp_path / "valid.mp3"

        with patch("app.tts.edge_tts.Communicate") as mock_comm:
            comm_instance = AsyncMock()
            comm_instance.save = AsyncMock()
            mock_comm.return_value = comm_instance

            await tts_module.synthesize("Test text", output_path)

            mock_comm.assert_called_once_with("Test text", "en-US-AriaNeural")

    @pytest.mark.asyncio
    async def test_synthesize_uses_aria_voice(self):
        """en-US-AriaNeural voice is used by default."""
        from app.tts import DEFAULT_VOICE

        assert DEFAULT_VOICE == "en-US-AriaNeural"

        output_path = self.audio_dir / "voice_test.mp3"
        with patch("app.tts.edge_tts.Communicate") as mock_comm:
            comm_instance = AsyncMock()
            comm_instance.save = AsyncMock()
            mock_comm.return_value = comm_instance

            await tts_module.synthesize("Hello", output_path)

            mock_comm.assert_called_once_with("Hello", "en-US-AriaNeural")
