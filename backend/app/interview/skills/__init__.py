"""Interview skill registry."""

from app.interview.skills.base import InterviewSkill
from app.interview.skills.final import SKILL as FINAL_SKILL
from app.interview.skills.introduction import SKILL as INTRO_SKILL
from app.interview.skills.technical import SKILL as TECHNICAL_SKILL

SKILLS: dict[str, InterviewSkill] = {
    INTRO_SKILL.id: INTRO_SKILL,
    TECHNICAL_SKILL.id: TECHNICAL_SKILL,
    FINAL_SKILL.id: FINAL_SKILL,
}

INTERVIEW_TYPES = tuple(SKILLS.keys())


def get_skill(skill_id: str) -> InterviewSkill:
    try:
        return SKILLS[skill_id]
    except KeyError:
        raise ValueError(
            f"Unknown interview type: {skill_id!r}. "
            f"Available: {', '.join(INTERVIEW_TYPES)}"
        ) from None


def list_skills() -> list[dict]:
    return [
        {
            "id": skill.id,
            "title": skill.title,
            "description": skill.description,
            "focus": skill.focus,
        }
        for skill in SKILLS.values()
    ]
