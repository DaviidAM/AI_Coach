"""Pydantic models for the interview coach API."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

InterviewType = Literal["intro", "technical", "final"]

FEEDBACK_CATEGORIES = (
    "structure",
    "relevance",
    "depth",
    "technical_accuracy",
    "communication",
    "impact",
    "leadership",
    "tradeoffs",
    "problem_solving",
    "culture_fit",
    "closing",
    "other",
)

SEVERITIES = ("critical", "major", "minor")


class InterviewBrief(BaseModel):
    role_title: str = "Software Engineer"
    company: str = "the company"
    seniority: str = "mid-level"
    role_track: str = "software_engineering"
    key_skills: list[str] = Field(default_factory=list)
    offer_digest: str = ""


class SkillInfo(BaseModel):
    id: InterviewType
    title: str
    description: str
    focus: str


class SkillsResponse(BaseModel):
    skills: list[SkillInfo]
    message_limit: Optional[int] = None
    unlimited: bool = False


class FeedbackItem(BaseModel):
    id: str
    turn: int
    question: str
    category: str = "other"
    severity: str = "major"
    evidence: str = ""
    issue: str
    why_it_matters: str
    better_answer: str
    timestamp: str


class SetupResponse(BaseModel):
    session_id: str
    interview_type: InterviewType
    brief: InterviewBrief
    opening_message: str
    opening_audio_url: Optional[str] = None
    turn: int = 0


class InterviewMessage(BaseModel):
    role: Literal["interviewer", "candidate"]
    text: str
    audio_url: Optional[str] = None
    timestamp: Optional[str] = None


class InterviewTurnResponse(BaseModel):
    session_id: str
    user_text: str
    user_audio_url: Optional[str] = None
    interviewer_text: str
    interviewer_audio_url: Optional[str] = None
    feedback: list[FeedbackItem] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    answer_score: int = 3
    turn: int = 1


class SessionResponse(BaseModel):
    configured: bool
    session_id: str
    interview_type: Optional[InterviewType] = None
    brief: Optional[InterviewBrief] = None
    messages: list[InterviewMessage] = Field(default_factory=list)
    feedback: list[FeedbackItem] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    latest_strengths: list[str] = Field(default_factory=list)
    turn: int = 0
    answer_scores: list[int] = Field(default_factory=list)
    report: Optional[dict] = None


class FeedbackHistoryResponse(BaseModel):
    feedback: list[FeedbackItem]
    total: int


class ReportResponse(BaseModel):
    overall_score: float
    readiness: str
    summary: str
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    questions_answered: int = 0


class ResetResponse(BaseModel):
    ok: bool
