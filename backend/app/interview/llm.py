"""LLM orchestration for the interview coach.

Reuses the provider dispatch in :mod:`app.llm`, but keeps the interview
prompts, response parsing and fallbacks independent from the English coach.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.interview.models import FEEDBACK_CATEGORIES, SEVERITIES
from app.interview.offer import heuristic_brief
from app.interview.prompts import (
    build_brief_messages,
    build_report_messages,
    extract_json_object,
)
from app.interview.skills.base import InterviewSkill
from app.llm import DEFAULT_SETTINGS, LLMError, call_llm

_logger = logging.getLogger(__name__)

LLM_CALL_ERRORS = (LLMError, httpx.HTTPError, ValueError, KeyError, OSError)

VALID_TRACKS = {
    "software_engineering",
    "data",
    "ai_ml",
    "architecture",
    "technical_lead",
}


def _settings_or_default(settings: Optional[dict]) -> dict:
    return settings if settings else DEFAULT_SETTINGS.copy()


def _call_json(messages: list[dict], settings: dict) -> dict:
    """Call the LLM and parse JSON, retrying once with a repair instruction."""
    raw = call_llm(messages, settings)
    try:
        return extract_json_object(raw)
    except (ValueError, TypeError):
        repair = messages + [
            {
                "role": "user",
                "content": (
                    "Your previous response was not valid JSON. Return ONLY the "
                    "JSON object requested by the system prompt, with no prose and "
                    "no Markdown fences."
                ),
            }
        ]
        raw = call_llm(repair, settings)
        try:
            return extract_json_object(raw)
        except (ValueError, TypeError) as exc:
            raise LLMError(
                f"Interview LLM returned malformed JSON after retry: {raw[:200]}"
            ) from exc


# ---------------------------------------------------------------------------
# Setup / brief
# ---------------------------------------------------------------------------

def generate_brief(
    skill: InterviewSkill,
    offer_text: str,
    settings: Optional[dict] = None,
) -> tuple[dict, str, Optional[str]]:
    """Return (brief, opening_message, fallback_reason)."""
    settings = _settings_or_default(settings)
    fallback_brief = heuristic_brief(offer_text)
    messages = build_brief_messages(skill, offer_text)

    try:
        data = _call_json(messages, settings)
    except LLM_CALL_ERRORS as exc:
        _logger.warning("Interview brief fallback: %s", exc)
        return fallback_brief, skill.opening_for(fallback_brief), str(exc)

    brief = _normalise_brief(data, fallback_brief)
    opening = data.get("opening_message")
    if not isinstance(opening, str) or not opening.strip():
        opening = skill.opening_for(brief)
    return brief, opening.strip(), None


def _normalise_brief(data: dict, fallback: dict) -> dict:
    role_title = _clean_str(data.get("role_title")) or fallback["role_title"]
    company = _clean_str(data.get("company")) or fallback["company"]
    seniority = _clean_str(data.get("seniority")) or fallback["seniority"]
    track = _clean_str(data.get("role_track")) or fallback["role_track"]
    if track not in VALID_TRACKS:
        track = fallback["role_track"]

    raw_skills = data.get("key_skills")
    skills: list[str] = []
    if isinstance(raw_skills, list):
        for value in raw_skills:
            cleaned = _clean_str(value)
            if cleaned and cleaned not in skills:
                skills.append(cleaned)
    if not skills:
        skills = list(fallback.get("key_skills", []))
    skills = skills[:10]

    digest = _clean_str(data.get("offer_digest")) or fallback["offer_digest"]
    return {
        "role_title": role_title[:160],
        "company": company[:120],
        "seniority": seniority[:60],
        "role_track": track,
        "key_skills": skills,
        "offer_digest": digest[:3000],
    }


# ---------------------------------------------------------------------------
# Interview turn
# ---------------------------------------------------------------------------

def generate_turn(
    skill: InterviewSkill,
    brief: dict,
    history: list[dict],
    current_question: str,
    turn: int,
    settings: Optional[dict] = None,
) -> tuple[dict, Optional[str]]:
    """Return (turn_result, fallback_reason)."""
    settings = _settings_or_default(settings)
    last_answer = _last_user_answer(history)
    messages = [{"role": "system", "content": skill.system_prompt(brief, turn)}] + history

    try:
        data = _call_json(messages, settings)
    except LLM_CALL_ERRORS as exc:
        _logger.warning("Interview turn fallback: %s", exc)
        return (
            _fallback_turn(skill, last_answer, current_question, turn),
            str(exc),
        )

    return (
        _normalise_turn(data, last_answer, current_question, turn, skill),
        None,
    )


def _normalise_turn(
    data: dict,
    last_answer: str,
    current_question: str,
    turn: int,
    skill: InterviewSkill,
) -> dict:
    interviewer_reply = _clean_str(data.get("interviewer_reply"))
    if not interviewer_reply:
        interviewer_reply = _fallback_question(skill, turn)

    score = _clamp_int(data.get("answer_score"), minimum=1, maximum=5, default=3)
    strengths = _normalise_str_list(data.get("strengths"), limit=3)

    raw_feedback = (
        data.get("feedback")
        or data.get("mistakes")
        or data.get("improvements")
        or []
    )
    if isinstance(raw_feedback, dict):
        raw_feedback = [raw_feedback]
    if not isinstance(raw_feedback, list):
        raw_feedback = []

    feedback: list[dict] = []
    for raw in raw_feedback:
        item = _normalise_feedback_item(raw, current_question, turn)
        if item:
            feedback.append(item)
        if len(feedback) >= 3:
            break

    feedback.sort(key=lambda item: _severity_rank(item.get("severity", "major")))

    # If the model produced nothing usable at all, give one concrete polish.
    if not feedback and not strengths and last_answer.strip():
        feedback.append(
            _make_feedback_item(
                question=current_question,
                turn=turn,
                category="other",
                severity="minor",
                evidence=last_answer[:160],
                issue="The answer could be more concrete for this role.",
                why_it_matters=(
                    "Interviewers need specific evidence to compare candidates; a "
                    "general answer is hard to assess."
                ),
                better_answer=(
                    "Add one concrete example: the situation, your action, the "
                    "trade-off you made and the measurable result."
                ),
            )
        )

    return {
        "interviewer_reply": interviewer_reply,
        "answer_score": score,
        "strengths": strengths,
        "feedback": feedback,
    }


def _normalise_feedback_item(raw, question: str, turn: int) -> Optional[dict]:
    if isinstance(raw, str):
        text = _clean_str(raw)
        if not text:
            return None
        return _make_feedback_item(
            question=question,
            turn=turn,
            category="other",
            severity="major",
            evidence="",
            issue=text,
            why_it_matters="This weakens the answer for the target role.",
            better_answer=text,
        )
    if not isinstance(raw, dict):
        return None

    issue = (
        _clean_str(raw.get("issue"))
        or _clean_str(raw.get("mistake"))
        or _clean_str(raw.get("problem"))
        or _clean_str(raw.get("feedback"))
    )
    better = (
        _clean_str(raw.get("better_answer"))
        or _clean_str(raw.get("improvement"))
        or _clean_str(raw.get("suggestion"))
        or _clean_str(raw.get("how_to_improve"))
    )
    if not issue and not better:
        return None
    if not issue:
        issue = "The answer can be strengthened."
    if not better:
        better = (
            "Rewrite the answer around the missing element: state the context, your "
            "specific action, the trade-off and the measurable outcome."
        )

    why = (
        _clean_str(raw.get("why_it_matters"))
        or _clean_str(raw.get("why"))
        or _clean_str(raw.get("impact"))
        or "This is a signal interviewers use to assess readiness for the role."
    )
    evidence = (
        _clean_str(raw.get("evidence"))
        or _clean_str(raw.get("quote"))
        or _clean_str(raw.get("original_phrase"))
    )
    category = _clean_str(raw.get("category") or raw.get("type")).lower()
    if category not in FEEDBACK_CATEGORIES:
        category = "other"
    severity = _clean_str(raw.get("severity") or raw.get("level")).lower()
    if severity not in SEVERITIES:
        severity = "major"

    return _make_feedback_item(
        question=(_clean_str(raw.get("question")) or question)[:500],
        turn=turn,
        category=category,
        severity=severity,
        evidence=evidence[:300],
        issue=issue[:600],
        why_it_matters=why[:600],
        better_answer=better[:1200],
    )


def _make_feedback_item(
    question: str,
    turn: int,
    category: str,
    severity: str,
    evidence: str,
    issue: str,
    why_it_matters: str,
    better_answer: str,
) -> dict:
    return {
        "id": uuid.uuid4().hex,
        "turn": turn,
        "question": question,
        "category": category,
        "severity": severity,
        "evidence": evidence,
        "issue": issue,
        "why_it_matters": why_it_matters,
        "better_answer": better_answer,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Final report
# ---------------------------------------------------------------------------

def generate_report(
    skill: InterviewSkill,
    brief: dict,
    history: list[dict],
    feedback: list[dict],
    scores: list[int],
    strengths: list[str],
    settings: Optional[dict] = None,
) -> tuple[dict, Optional[str]]:
    settings = _settings_or_default(settings)
    transcript = _format_transcript(history)
    feedback_text = _format_feedback(feedback)
    messages = build_report_messages(skill, brief, transcript, feedback_text)

    try:
        data = _call_json(messages, settings)
        report = _normalise_report(data, scores, feedback, strengths)
        return report, None
    except LLM_CALL_ERRORS as exc:
        _logger.warning("Interview report fallback: %s", exc)
        return _fallback_report(scores, feedback, strengths), str(exc)


def _normalise_report(
    data: dict,
    scores: list[int],
    feedback: list[dict],
    strengths: list[str],
) -> dict:
    average = _average_score(scores)
    overall = data.get("overall_score", average)
    try:
        overall = float(overall)
    except (TypeError, ValueError):
        overall = average
    overall = max(1.0, min(5.0, round(overall, 1)))

    readiness = _clean_str(data.get("readiness")).lower()
    if readiness not in {"not_ready", "getting_there", "interview_ready"}:
        readiness = _readiness_for(overall)

    summary = _clean_str(data.get("summary")) or (
        "You completed the practice interview. Use the gaps below to prepare "
        "the next round."
    )
    report_strengths = _normalise_str_list(data.get("strengths"), limit=5)
    if not report_strengths:
        report_strengths = list(dict.fromkeys(strengths))[:5]

    gaps = _normalise_str_list(data.get("gaps"), limit=5)
    if not gaps:
        gaps = _gaps_from_feedback(feedback)

    next_steps = _normalise_str_list(data.get("next_steps"), limit=5)
    if not next_steps:
        next_steps = _next_steps_from_feedback(feedback)

    return {
        "overall_score": overall,
        "readiness": readiness,
        "summary": summary[:1200],
        "strengths": report_strengths,
        "gaps": gaps,
        "next_steps": next_steps,
        "questions_answered": len(scores),
    }


def _fallback_report(
    scores: list[int],
    feedback: list[dict],
    strengths: list[str],
) -> dict:
    average = _average_score(scores)
    return {
        "overall_score": max(1.0, average),
        "readiness": _readiness_for(max(1.0, average)),
        "summary": (
            "This report was generated without the language model. It is based on "
            "the score and feedback collected during the interview. Review the "
            "recurring gaps and practise the suggested next steps."
        ),
        "strengths": list(dict.fromkeys(strengths))[:5]
        or ["You completed the interview and produced answers to review."],
        "gaps": _gaps_from_feedback(feedback),
        "next_steps": _next_steps_from_feedback(feedback),
        "questions_answered": len(scores),
    }


# ---------------------------------------------------------------------------
# Fallbacks and helpers
# ---------------------------------------------------------------------------

_FALLBACK_QUESTIONS = {
    "intro": (
        "Thanks. Could you make that more specific: which part of your experience "
        "is most relevant to this role, and what result did you personally achieve?",
        "What attracts you specifically to this company and this role?",
        "Which of your achievements best demonstrates the impact this role needs?",
        "What questions do you have for me about the role or the team?",
    ),
    "technical": (
        "Let's go deeper. What trade-offs did you consider, and why did you choose "
        "that approach over the alternatives?",
        "How would that design behave at ten times the current scale, and where "
        "would it fail first?",
        "What would you test or monitor to know that this works correctly in production?",
        "Can you walk me through a failure or incident in that system and how you handled it?",
    ),
    "final": (
        "What was your personal contribution, and what measurable outcome changed?",
        "Tell me about a disagreement with a colleague or stakeholder and how you resolved it.",
        "Tell me about a decision that did not go well. What did you change afterwards?",
        "How do you prioritise when several important requests compete for limited time?",
    ),
}


def _fallback_question(skill: InterviewSkill, turn: int) -> str:
    questions = _FALLBACK_QUESTIONS.get(skill.id, _FALLBACK_QUESTIONS["technical"])
    return questions[min(max(turn - 1, 0), len(questions) - 1)]


def _fallback_turn(
    skill: InterviewSkill,
    answer: str,
    current_question: str,
    turn: int,
) -> dict:
    text = (answer or "").strip()
    lowered = text.lower()
    words = text.split()
    feedback: list[dict] = []
    strengths: list[str] = []

    if len(words) >= 45:
        strengths.append("Provided a developed answer rather than a one-line response.")
    if any(char.isdigit() for char in text):
        strengths.append("Included at least one concrete number or metric.")
    if " i " in f" {lowered} ":
        strengths.append("Used first-person ownership language.")

    if len(words) < 25:
        feedback.append(
            _make_feedback_item(
                question=current_question,
                turn=turn,
                category="depth",
                severity="major",
                evidence=text[:160],
                issue="The answer is too short to demonstrate your reasoning or experience.",
                why_it_matters=(
                    "Interviewers cannot assess depth or impact from a one-line answer; "
                    "they need context, action and result."
                ),
                better_answer=(
                    "Use a 4-part structure: set the situation in one sentence, explain "
                    "your specific action, name the trade-off or obstacle, then give the result."
                ),
            )
        )
    elif not any(char.isdigit() for char in text):
        feedback.append(
            _make_feedback_item(
                question=current_question,
                turn=turn,
                category="impact",
                severity="major",
                evidence=text[:160],
                issue="The answer describes activity but not a measurable outcome.",
                why_it_matters=(
                    "For engineering, data and leadership roles, impact is the main "
                    "signal that separates candidates."
                ),
                better_answer=(
                    "Add the before/after: latency, revenue, cost, adoption, incident "
                    "time, team velocity or another metric you personally influenced."
                ),
            )
        )

    if "we " in lowered and " i " not in f" {lowered} ":
        feedback.append(
            _make_feedback_item(
                question=current_question,
                turn=turn,
                category="leadership",
                severity="major",
                evidence=text[:160],
                issue="The answer stays at team level and does not clarify your contribution.",
                why_it_matters=(
                    "The interviewer needs to distinguish what you decided and delivered "
                    "from what the team did."
                ),
                better_answer=(
                    "Keep the team context, then say what you personally owned: the "
                    "decision, the work, the trade-off and the result."
                ),
            )
        )

    if "don't know" in lowered or "do not know" in lowered or "no sé" in lowered:
        feedback.append(
            _make_feedback_item(
                question=current_question,
                turn=turn,
                category="problem_solving",
                severity="critical",
                evidence=text[:160],
                issue="The answer stops at not knowing instead of showing how you would find out.",
                why_it_matters=(
                    "Interviewers accept gaps; they do not accept an inability to reason "
                    "or seek the missing information."
                ),
                better_answer=(
                    "Say what you do know, state the assumption you would make, describe "
                    "how you would verify it, and give the likely approach."
                ),
            )
        )

    if not feedback and not strengths:
        strengths.append("Answered the question directly.")
        feedback.append(
            _make_feedback_item(
                question=current_question,
                turn=turn,
                category="depth",
                severity="minor",
                evidence=text[:160],
                issue="The answer is acceptable but could be more memorable.",
                why_it_matters="Strong candidates leave the interviewer with one concrete example.",
                better_answer=(
                    "Add one specific example with a trade-off and a measurable result "
                    "to make the answer easier to remember and assess."
                ),
            )
        )

    feedback.sort(key=lambda item: _severity_rank(item.get("severity", "major")))
    feedback = feedback[:3]
    score = 4 if strengths and not feedback else 3 if len(feedback) <= 1 else 2
    if len(words) < 12:
        score = 1

    return {
        "interviewer_reply": _fallback_question(skill, turn),
        "answer_score": score,
        "strengths": strengths[:3],
        "feedback": feedback,
    }


def _last_user_answer(history: list[dict]) -> str:
    for message in reversed(history):
        if message.get("role") == "user":
            return message.get("content", "")
    return ""


def _format_transcript(history: list[dict]) -> str:
    lines = []
    for message in history:
        speaker = "Interviewer" if message.get("role") == "assistant" else "Candidate"
        lines.append(f"{speaker}: {message.get('content', '')}")
    return "\n".join(lines)


def _format_feedback(feedback: list[dict]) -> str:
    if not feedback:
        return "(no feedback recorded)"
    lines = []
    for item in feedback:
        lines.append(
            f"- [{item.get('severity', 'major')}/{item.get('category', 'other')}] "
            f"{item.get('issue', '')} | better: {item.get('better_answer', '')}"
        )
    return "\n".join(lines[:40])


def _gaps_from_feedback(feedback: list[dict]) -> list[str]:
    gaps: list[str] = []
    for item in feedback:
        issue = _clean_str(item.get("issue"))
        if issue and issue not in gaps:
            gaps.append(issue[:300])
        if len(gaps) >= 5:
            break
    return gaps or ["No specific gaps were recorded; answer more questions to get a clearer signal."]


def _next_steps_from_feedback(feedback: list[dict]) -> list[str]:
    steps: list[str] = []
    categories = {item.get("category") for item in feedback}
    if "impact" in categories:
        steps.append("Prepare 3-5 project stories with a before/after metric for each.")
    if "structure" in categories:
        steps.append("Rehearse a 90-second pitch and STAR answers with a clear result.")
    if "technical_accuracy" in categories or "depth" in categories:
        steps.append("Practice explaining one system or model end-to-end, including trade-offs.")
    if "tradeoffs" in categories:
        steps.append("For each design choice, write the alternative, the constraint and the trade-off.")
    if "leadership" in categories or "culture_fit" in categories:
        steps.append("Prepare examples of influence, conflict and mentoring with measurable outcomes.")
    if "closing" in categories:
        steps.append("Prepare three role-specific questions for the interviewer and a clear close.")
    if not steps:
        steps = [
            "Answer five more practice questions and review the feedback after each one.",
            "Record yourself and remove filler, vague claims and unnecessary backstory.",
            "For every story, state the situation, your action, the trade-off and the result.",
        ]
    return steps[:5]


def _average_score(scores: list[int]) -> float:
    if not scores:
        return 0.0
    return round(sum(scores) / len(scores), 1)


def _severity_rank(severity: str) -> int:
    return {"critical": 0, "major": 1, "minor": 2}.get(severity, 1)


def _readiness_for(score: float) -> str:
    if score < 2.5:
        return "not_ready"
    if score < 3.7:
        return "getting_there"
    return "interview_ready"


def _normalise_str_list(value, limit: int) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        cleaned = _clean_str(item)
        if cleaned and cleaned not in result:
            result.append(cleaned[:400])
        if len(result) >= limit:
            break
    return result


def _clamp_int(value, minimum: int, maximum: int, default: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, number))


def _clean_str(value) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    return " ".join(value.split()).strip()
