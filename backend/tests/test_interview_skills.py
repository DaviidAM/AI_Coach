"""Tests for interview skills and their prompt contract."""

from app.interview.skills import INTERVIEW_TYPES, get_skill, list_skills
from app.interview.skills.base import InterviewSkill

BRIEF = {
    "role_title": "Senior Backend Engineer",
    "company": "Acme",
    "seniority": "senior",
    "role_track": "software_engineering",
    "key_skills": ["Python", "AWS", "distributed systems"],
    "offer_digest": "Build reliable backend services.",
}


def test_registry_contains_three_interview_types():
    assert INTERVIEW_TYPES == ("intro", "technical", "final")
    assert {item["id"] for item in list_skills()} == {"intro", "technical", "final"}


def test_each_skill_builds_a_system_prompt_with_feedback_contract():
    for skill_id in INTERVIEW_TYPES:
        skill = get_skill(skill_id)
        prompt = skill.system_prompt(BRIEF, turn=2)
        assert isinstance(skill, InterviewSkill)
        assert skill.title
        assert skill.question_plan
        assert skill.evaluation_dimensions
        assert skill.common_mistakes
        assert "interviewer_reply" in prompt
        assert "better_answer" in prompt
        assert "why_it_matters" in prompt
        assert "evidence" in prompt
        assert "feedback" in prompt
        assert "TURN: 2" in prompt
        assert "Senior Backend Engineer" in prompt
        assert "Acme" in prompt


def test_technical_skill_has_role_track_guidance():
    prompt = get_skill("technical").system_prompt(BRIEF)
    for track in ("software_engineering", "data", "ai_ml", "architecture", "technical_lead"):
        assert track in prompt


def test_unknown_skill_raises_value_error():
    try:
        get_skill("nope")
    except ValueError as exc:
        assert "Unknown interview type" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected ValueError")


def test_each_skill_has_a_fallback_opening():
    for skill_id in INTERVIEW_TYPES:
        skill = get_skill(skill_id)
        opening = skill.opening_for(BRIEF)
        assert "Senior Backend Engineer" in opening
        assert "Acme" in opening
