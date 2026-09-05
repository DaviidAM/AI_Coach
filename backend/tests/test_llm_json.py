import pytest
from unittest.mock import patch
from app.llm import parse_and_validate_reply, build_messages, SYSTEM_PROMPT


class TestParseAndValidateReply:
    def test_valid_reply(self):
        raw = '{"reply": "Sounds good!", "corrections": [{"original_phrase": "I have went", "corrected_phrase": "I have gone", "explanation": "Use past participle", "error_level": "A2", "category": "grammar"}]}'
        result = parse_and_validate_reply(raw)
        assert result["reply"] == "Sounds good!"
        assert len(result["corrections"]) == 1

    def test_missing_reply_field(self):
        raw = '{"corrections": []}'
        with pytest.raises(ValueError):
            parse_and_validate_reply(raw)

    def test_missing_corrections_field(self):
        raw = '{"reply": "Hello"}'
        with pytest.raises(ValueError):
            parse_and_validate_reply(raw)

    def test_invalid_json(self):
        with pytest.raises(Exception):
            parse_and_validate_reply("not json at all")

    def test_correction_missing_required_field(self):
        """A correction missing error_level (required) must raise ValueError."""
        raw = '{"reply": "Hi", "corrections": [{"original_phrase": "x", "corrected_phrase": "y", "explanation": "z"}]}'
        with pytest.raises(ValueError):
            parse_and_validate_reply(raw)

    def test_extra_fields_allowed(self):
        raw = '{"reply": "Hi", "corrections": [{"original_phrase": "x", "corrected_phrase": "y", "explanation": "...", "error_level": "A1", "category": "g", "extra": "allowed"}]}'
        result = parse_and_validate_reply(raw)
        assert result["reply"] == "Hi"


class TestBuildMessages:
    def test_system_prompt_injected(self):
        messages = build_messages("B1", [])
        assert messages[0]["role"] == "system"
        assert "B1" in messages[0]["content"]
        assert "COACH" in messages[0]["content"]

    def test_history_appended(self):
        history = [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi there"}]
        messages = build_messages("A2", history)
        assert len(messages) == 3  # system + 2 history
        assert messages[1]["content"] == "Hello"
        assert messages[2]["content"] == "Hi there"


class TestMockReplyErrorTypes:
    """Test _mock_reply error categorization (used when MINIMAX_API_KEY is unset)."""

    def test_mock_informations_returns_vocabulary(self):
        from app.llm import _mock_reply
        result = _mock_reply("B1", [{"role": "user", "content": "I need more informations."}])
        assert len(result["corrections"]) == 1
        assert result["corrections"][0]["error_type"] == "vocabulary"
        assert result["corrections"][0]["original_phrase"] == "informations"

    def test_mock_more_better_returns_suggestion(self):
        from app.llm import _mock_reply
        result = _mock_reply("A2", [{"role": "user", "content": "This is more better."}])
        assert len(result["corrections"]) == 1
        assert result["corrections"][0]["error_type"] == "suggestion"

    def test_mock_i_goed_returns_grammar(self):
        from app.llm import _mock_reply
        result = _mock_reply("A2", [{"role": "user", "content": "I goed to the store."}])
        assert len(result["corrections"]) == 1
        assert result["corrections"][0]["error_type"] == "grammar"

    def test_mock_buyed_returns_grammar(self):
        from app.llm import _mock_reply
        result = _mock_reply("A2", [{"role": "user", "content": "I buyed a book."}])
        assert len(result["corrections"]) == 1
        assert result["corrections"][0]["error_type"] == "grammar"

    def test_mock_no_errors(self):
        from app.llm import _mock_reply
        result = _mock_reply("B1", [{"role": "user", "content": "Hello, how are you?"}])
        assert result["corrections"] == []

    def test_mock_reply_includes_error_level(self):
        from app.llm import _mock_reply
        result = _mock_reply("A2", [{"role": "user", "content": "I goed there."}])
        assert len(result["corrections"]) == 1
        assert result["corrections"][0]["error_level"] == "A2"


class TestErrorTypeDefaults:
    def test_parse_and_validate_sets_error_type_default(self):
        """parse_and_validate_reply should set error_type to 'general' if missing."""
        raw = '{"reply": "Hi", "corrections": [{"original_phrase": "x", "corrected_phrase": "y", "explanation": "z", "error_level": "A1"}]}'
        result = parse_and_validate_reply(raw)
        assert result["corrections"][0]["error_type"] == "general"
        assert result["corrections"][0]["category"] == "general"

    def test_parse_and_validate_preserves_existing_error_type(self):
        """parse_and_validate_reply should preserve existing error_type."""
        raw = '{"reply": "Hi", "corrections": [{"original_phrase": "x", "corrected_phrase": "y", "explanation": "z", "error_level": "A1", "error_type": "vocabulary"}]}'
        result = parse_and_validate_reply(raw)
        assert result["corrections"][0]["error_type"] == "vocabulary"

    def test_parse_and_validate_sets_category_default(self):
        """parse_and_validate_reply should set category to 'general' if missing."""
        raw = '{"reply": "Hi", "corrections": [{"original_phrase": "x", "corrected_phrase": "y", "explanation": "z", "error_level": "A1"}]}'
        result = parse_and_validate_reply(raw)
        assert result["corrections"][0]["category"] == "general"
