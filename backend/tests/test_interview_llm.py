"""Tests for interview LLM parsing, normalization and offline fallbacks."""

import json
from unittest.mock import patch

from app.interview.llm import generate_brief, generate_report, generate_turn
from app.interview.skills import get_skill
from app.llm import LLMError

BRIEF = {
    "role_title": "Senior Backend Engineer",
    "company": "Acme",
    "seniority": "senior",
    "role_track": "software_engineering",
    "key_skills": ["Python", "AWS"],
    "offer_digest": "Build reliable services.",
}
OFFER = "Senior Backend Engineer at Acme. Python, AWS, distributed systems."


def test_generate_brief_falls_back_when_llm_fails():
    with patch("app.interview.llm.call_llm", side_effect=LLMError("no key")):
        brief, opening, reason = generate_brief(get_skill("technical"), OFFER)
    assert reason == "no key"
    assert brief["role_title"] == "Senior Backend Engineer"
    assert brief["company"] == "Acme"
    assert "Senior Backend Engineer" in opening


def test_generate_brief_normalizes_llm_output():
    raw = json.dumps(
        {
            "role_title": "Staff Data Engineer",
            "company": "DataCorp",
            "seniority": "staff",
            "role_track": "data",
            "key_skills": ["SQL", "Spark", "SQL"],
            "offer_digest": "Own the data platform.",
            "opening_message": "Hi, let's talk about data platforms.",
        }
    )
    with patch("app.interview.llm.call_llm", return_value=raw):
        brief, opening, reason = generate_brief(get_skill("technical"), OFFER)
    assert reason is None
    assert brief["role_track"] == "data"
    assert brief["key_skills"] == ["SQL", "Spark"]
    assert opening == "Hi, let's talk about data platforms."


def test_generate_turn_normalizes_feedback_aliases():
    raw = json.dumps(
        {
            "interviewer_reply": "Good. What trade-offs did you consider?",
            "answer_score": 9,
            "strengths": ["Clear ownership", "Clear ownership"],
            "mistakes": [
                {
                    "type": "impact",
                    "level": "critical",
                    "quote": "We made it faster.",
                    "mistake": "No metric was given.",
                    "why": "Impact is the main signal.",
                    "improvement": "Say latency dropped from 900ms to 120ms.",
                }
            ],
        }
    )
    history = [
        {"role": "assistant", "content": "Tell me about the project."},
        {"role": "user", "content": "We made it faster."},
    ]
    with patch("app.interview.llm.call_llm", return_value=raw):
        result, reason = generate_turn(
            get_skill("technical"),
            BRIEF,
            history,
            "Tell me about the project.",
            turn=1,
        )
    assert reason is None
    assert result["answer_score"] == 5
    assert result["strengths"] == ["Clear ownership"]
    assert result["feedback"][0]["category"] == "impact"
    assert result["feedback"][0]["severity"] == "critical"
    assert result["feedback"][0]["issue"] == "No metric was given."
    assert result["feedback"][0]["better_answer"].startswith("Say latency dropped")
    assert result["feedback"][0]["turn"] == 1


def test_generate_turn_retries_once_on_malformed_json():
    good = json.dumps(
        {
            "interviewer_reply": "Next question?",
            "answer_score": 3,
            "strengths": [],
            "feedback": [],
        }
    )
    with patch("app.interview.llm.call_llm", side_effect=["not json", good]) as mock:
        result, reason = generate_turn(
            get_skill("technical"),
            BRIEF,
            [{"role": "user", "content": "An answer."}],
            "Question?",
            turn=1,
        )
    assert reason is None
    assert result["interviewer_reply"] == "Next question?"
    assert mock.call_count == 2


def test_generate_turn_falls_back_when_llm_fails():
    history = [
        {"role": "assistant", "content": "Tell me about a failure."},
        {"role": "user", "content": "I don't know."},
    ]
    with patch("app.interview.llm.call_llm", side_effect=LLMError("down")):
        result, reason = generate_turn(
            get_skill("final"), BRIEF, history, "Tell me about a failure.", turn=1
        )
    assert reason == "down"
    assert result["feedback"]
    assert result["feedback"][0]["category"] == "problem_solving"
    assert result["interviewer_reply"]


def test_generate_report_falls_back_and_uses_scores():
    feedback = [
        {
            "issue": "No measurable outcome.",
            "category": "impact",
            "severity": "major",
            "better_answer": "Add a metric.",
        }
    ]
    with patch("app.interview.llm.call_llm", side_effect=LLMError("down")):
        report, reason = generate_report(
            get_skill("technical"),
            BRIEF,
            [{"role": "user", "content": "An answer."}],
            feedback,
            scores=[3, 4],
            strengths=["Clear ownership"],
        )
    assert reason == "down"
    assert report["overall_score"] == 3.5
    assert report["readiness"] == "getting_there"
    assert report["questions_answered"] == 2
    assert report["gaps"] == ["No measurable outcome."]
