"""Base class and shared prompt builder for interview skills."""

from dataclasses import dataclass, field

from app.interview.prompts import FEEDBACK_CONTRACT, SHARED_RULES, brief_to_prompt


@dataclass(frozen=True)
class InterviewSkill:
    """A self-contained interview stage: persona, plan, rubric and feedback rules."""

    id: str
    title: str
    description: str
    focus: str
    persona: str
    objective: str
    question_plan: tuple[str, ...]
    evaluation_dimensions: dict[str, str]
    common_mistakes: tuple[str, ...]
    role_tracks: dict[str, str] = field(default_factory=dict)
    opening_guidance: str = ""
    closing_guidance: str = ""
    fallback_opening: str = (
        "Hi, I'm the interviewer for the {role_title} role at {company}. "
        "Thanks for making the time. Could you start by telling me about yourself?"
    )
    score_guide: dict[int, str] = field(
        default_factory=lambda: {
            1: "Does not answer the question or is materially incorrect.",
            2: "Weak: generic, incomplete or missing the key requirement.",
            3: "Acceptable: answers the question but lacks depth or evidence.",
            4: "Strong: specific, structured and relevant, with minor gaps.",
            5: "Exceptional for the target seniority: precise, insightful and well evidenced.",
        }
    )

    def opening_for(self, brief: dict) -> str:
        return self.fallback_opening.format(
            role_title=brief.get("role_title", "this role"),
            company=brief.get("company", "the company"),
            seniority=brief.get("seniority", "mid-level"),
        )

    def system_prompt(self, brief: dict, turn: int = 0) -> str:
        dimensions = "\n".join(
            f"- {name}: {description}" for name, description in self.evaluation_dimensions.items()
        )
        mistakes = "\n".join(f"- {item}" for item in self.common_mistakes)
        plan = "\n".join(f"{index + 1}. {item}" for index, item in enumerate(self.question_plan))
        score_guide = "\n".join(f"- {score}/5: {text}" for score, text in self.score_guide.items())

        tracks = ""
        if self.role_tracks:
            tracks = (
                "\nROLE-TRACK GUIDANCE\n"
                "Use the `role_track` from the brief to choose role-appropriate questions. "
                "If the track is missing, infer it from the offer.\n"
                + "\n".join(f"- {name}: {text}" for name, text in self.role_tracks.items())
                + "\n"
            )

        return f"""\
You are conducting a {self.title} interview for this role:

ROLE BRIEF
{brief_to_prompt(brief)}

INTERVIEW STAGE: {self.title}
STAGE FOCUS: {self.focus}
TURN: {turn} (0 = opening; each candidate answer increments the turn)

YOUR PERSONA
{self.persona}

YOUR OBJECTIVE
{self.objective}

QUESTION PLAN
{plan}

OPENING GUIDANCE
{self.opening_guidance}

CLOSING GUIDANCE
{self.closing_guidance}
{tracks}
EVALUATION RUBRIC
{dimensions}

SCORE GUIDE
{score_guide}

COMMON MISTAKES TO WATCH FOR
Only mention a mistake if the candidate actually makes it. Do not read this list to the candidate.
{mistakes}

{SHARED_RULES}

{FEEDBACK_CONTRACT}
""".strip()
