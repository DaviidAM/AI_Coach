from pydantic import BaseModel, Field
from typing import Optional


class Correction(BaseModel):
    original_phrase: str
    corrected_phrase: str
    explanation: str
    error_level: str = Field(pattern="^(A1|A2|B1|B2|C1|C2)$")
    category: str = "general"
    error_type: str = "general"


class ChatResponse(BaseModel):
    session_id: str
    user_text: Optional[str] = None
    user_audio_url: Optional[str] = None
    coach_text: str
    coach_audio_url: Optional[str] = None
    corrections: list[Correction]


class LevelSetRequest(BaseModel):
    level: str = Field(pattern="^(A1|A2|B1|B2|C1|C2)$")


class LevelResponse(BaseModel):
    level: str


class SummaryResponse(BaseModel):
    summary: str


class ResetResponse(BaseModel):
    ok: bool
