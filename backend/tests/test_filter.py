import pytest
from app.filter import filter_corrections, CEFR_ORDER


class TestFilterCorrections:
    def test_filter_a2_user_sees_a1_and_a2_only(self):
        corrections = [
            {"original_phrase": "I go yesterday", "corrected_phrase": "I went yesterday", "explanation": "Use past simple", "error_level": "A1", "category": "tense"},
            {"original_phrase": "I have went", "corrected_phrase": "I have gone", "explanation": "Use past participle after 'have'", "error_level": "A2", "category": "grammar"},
            {"original_phrase": "If I would have money", "corrected_phrase": "If I had money", "explanation": "Conditionals", "error_level": "B1", "category": "grammar"},
        ]
        result = filter_corrections(corrections, "A2")
        assert len(result) == 2
        assert all(c["error_level"] in ("A1", "A2") for c in result)

    def test_filter_b1_user_sees_a1_a2_b1(self):
        corrections = [
            {"original_phrase": "a apple", "corrected_phrase": "an apple", "explanation": "Article before vowel", "error_level": "A1", "category": "articles"},
            {"original_phrase": "I have went", "corrected_phrase": "I have gone", "explanation": "Past participle", "error_level": "A2", "category": "grammar"},
            {"original_phrase": "If I would have known", "corrected_phrase": "If I had known", "explanation": "Conditional", "error_level": "B1", "category": "conditionals"},
            {"original_phrase": "Passive voice", "corrected_phrase": "was broken", "explanation": "Passive", "error_level": "B2", "category": "voice"},
        ]
        result = filter_corrections(corrections, "B1")
        assert len(result) == 3
        assert all(CEFR_ORDER.index(c["error_level"]) <= CEFR_ORDER.index("B1") for c in result)

    def test_filter_c2_user_sees_all(self):
        corrections = [
            {"original_phrase": "a apple", "corrected_phrase": "an apple", "error_level": "A1", "explanation": "...", "category": "articles"},
            {"original_phrase": "I have went", "corrected_phrase": "I have gone", "error_level": "A2", "explanation": "...", "category": "grammar"},
            {"original_phrase": "if I would have", "corrected_phrase": "if I had", "error_level": "B1", "explanation": "...", "category": "conditionals"},
            {"original_phrase": "passive", "corrected_phrase": "was done", "error_level": "B2", "explanation": "...", "category": "voice"},
            {"original_phrase": "subjunctive", "corrected_phrase": "were", "error_level": "C1", "explanation": "...", "category": "mood"},
            {"original_phrase": "stylistic nuance", "corrected_phrase": "register", "error_level": "C2", "explanation": "...", "category": "style"},
        ]
        result = filter_corrections(corrections, "C2")
        assert len(result) == 6

    def test_filter_unknown_level_passes_all(self):
        corrections = [{"original_phrase": "x", "corrected_phrase": "y", "explanation": "...", "error_level": "A1", "category": "x"}]
        result = filter_corrections(corrections, "X9")
        assert len(result) == 1

    def test_filter_empty_corrections(self):
        result = filter_corrections([], "B1")
        assert result == []

    def test_filter_exactly_at_cutoff(self):
        corrections = [{"original_phrase": "x", "corrected_phrase": "y", "explanation": "...", "error_level": "B1", "category": "x"}]
        result = filter_corrections(corrections, "B1")
        assert len(result) == 1
