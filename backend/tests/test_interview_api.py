"""End-to-end API tests for the interview coach."""

from unittest.mock import AsyncMock, patch

import pytest

BRIEF = {
    "role_title": "Senior Backend Engineer",
    "company": "Acme",
    "seniority": "senior",
    "role_track": "software_engineering",
    "key_skills": ["Python", "AWS", "distributed systems"],
    "offer_digest": "Build reliable backend services for Acme.",
}
OPENING = "Hi, I'm the technical interviewer for the Senior Backend Engineer role at Acme. Could you walk me through your most relevant project?"
OFFER = "Senior Backend Engineer at Acme. Python, AWS, Kubernetes, distributed systems."


def _setup(client, session_id: str = "interview-1", interview_type: str = "technical"):
    with patch("app.api.interview.generate_brief", return_value=(BRIEF, OPENING, None)):
        with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
            return client.post(
                "/api/interview/setup",
                data={
                    "session_id": session_id,
                    "interview_type": interview_type,
                    "job_text": OFFER,
                },
            )


def _turn_payload():
    return {
        "interviewer_reply": "Thanks. Now tell me about a production incident you handled.",
        "answer_score": 3,
        "strengths": ["Clear ownership"],
        "feedback": [
            {
                "id": "f1",
                "turn": 1,
                "question": "Walk me through your most relevant project.",
                "category": "impact",
                "severity": "major",
                "evidence": "We improved it a lot.",
                "issue": "No measurable outcome was given.",
                "why_it_matters": "Impact is the main signal for this role.",
                "better_answer": "State the latency before/after and your specific contribution.",
                "timestamp": "2026-01-01T00:00:00+00:00",
            }
        ],
    }


def test_list_skills_endpoint(client):
    response = client.get("/api/interview/skills")
    assert response.status_code == 200
    payload = response.json()
    assert {item["id"] for item in payload["skills"]} == {"intro", "technical", "final"}
    assert payload["unlimited"] is False
    assert payload["message_limit"] == 20


def test_setup_with_text_creates_opening_message(client):
    response = _setup(client)
    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == "interview-1"
    assert payload["interview_type"] == "technical"
    assert payload["brief"]["role_title"] == "Senior Backend Engineer"
    assert payload["opening_message"] == OPENING
    assert payload["turn"] == 0


def test_setup_with_txt_file(client):
    with patch("app.api.interview.generate_brief", return_value=(BRIEF, OPENING, None)):
        with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
            response = client.post(
                "/api/interview/setup",
                data={"session_id": "file-1", "interview_type": "intro"},
                files={"job_file": ("offer.txt", OFFER.encode(), "text/plain")},
            )
    assert response.status_code == 200
    assert response.json()["brief"]["company"] == "Acme"


def test_setup_rejects_missing_offer(client):
    with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
        response = client.post(
            "/api/interview/setup",
            data={"session_id": "missing", "interview_type": "technical"},
        )
    assert response.status_code == 400


def test_setup_rejects_both_text_and_file(client):
    with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
        response = client.post(
            "/api/interview/setup",
            data={
                "session_id": "both",
                "interview_type": "technical",
                "job_text": OFFER,
            },
            files={"job_file": ("offer.txt", OFFER.encode(), "text/plain")},
        )
    assert response.status_code == 400


def test_setup_rejects_unknown_type(client):
    response = client.post(
        "/api/interview/setup",
        data={
            "session_id": "bad-type",
            "interview_type": "behavioural",
            "job_text": OFFER,
        },
    )
    assert response.status_code == 422


def test_session_is_not_configured_before_setup(client):
    response = client.get("/api/interview/session?session_id=nope")
    assert response.status_code == 200
    payload = response.json()
    assert payload["configured"] is False
    assert payload["messages"] == []


def test_chat_requires_setup(client):
    response = client.post(
        "/api/interview/chat",
        data={"session_id": "not-configured", "text": "Hello"},
    )
    assert response.status_code == 409


def test_chat_turn_returns_feedback_and_persists_session(client):
    assert _setup(client).status_code == 200
    with patch("app.api.interview.generate_turn", return_value=(_turn_payload(), None)):
        with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
            response = client.post(
                "/api/interview/chat",
                data={"session_id": "interview-1", "text": "I improved the service a lot."},
            )

    assert response.status_code == 200
    payload = response.json()
    assert payload["turn"] == 1
    assert payload["interviewer_text"].startswith("Thanks")
    assert payload["answer_score"] == 3
    assert payload["feedback"][0]["category"] == "impact"
    assert payload["feedback"][0]["better_answer"]

    restored = client.get("/api/interview/session?session_id=interview-1").json()
    assert restored["configured"] is True
    assert len(restored["messages"]) == 3  # opening + candidate + interviewer
    assert restored["messages"][1]["role"] == "candidate"
    assert restored["feedback"][0]["issue"] == "No measurable outcome was given."
    assert restored["strengths"] == ["Clear ownership"]
    assert restored["latest_strengths"] == ["Clear ownership"]
    assert restored["answer_scores"] == [3]


def test_feedback_history_is_paginated(client):
    assert _setup(client).status_code == 200
    with patch("app.api.interview.generate_turn", return_value=(_turn_payload(), None)):
        with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
            client.post(
                "/api/interview/chat",
                data={"session_id": "interview-1", "text": "Answer one."},
            )

    response = client.get(
        "/api/interview/feedback?session_id=interview-1&limit=1&offset=0"
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert len(payload["feedback"]) == 1


def test_report_endpoint(client):
    assert _setup(client).status_code == 200
    with patch("app.api.interview.generate_turn", return_value=(_turn_payload(), None)):
        with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
            client.post(
                "/api/interview/chat",
                data={"session_id": "interview-1", "text": "Answer one."},
            )

    report = {
        "overall_score": 3.5,
        "readiness": "getting_there",
        "summary": "Solid communication with gaps in measurable impact.",
        "strengths": ["Clear ownership"],
        "gaps": ["No measurable outcome"],
        "next_steps": ["Add metrics to each story"],
        "questions_answered": 1,
    }
    with patch("app.api.interview.generate_report", return_value=(report, None)):
        response = client.post("/api/interview/report?session_id=interview-1")

    assert response.status_code == 200
    assert response.json()["readiness"] == "getting_there"
    assert response.json()["questions_answered"] == 1


def test_reset_with_keep_setup_restores_opening_only(client):
    assert _setup(client).status_code == 200
    with patch("app.api.interview.generate_turn", return_value=(_turn_payload(), None)):
        with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
            client.post(
                "/api/interview/chat",
                data={"session_id": "interview-1", "text": "Answer one."},
            )

    response = client.post(
        "/api/interview/reset?session_id=interview-1&keep_setup=true"
    )
    assert response.status_code == 200
    restored = client.get("/api/interview/session?session_id=interview-1").json()
    assert restored["configured"] is True
    assert len(restored["messages"]) == 1
    assert restored["messages"][0]["text"] == OPENING
    assert restored["feedback"] == []


def test_reset_without_keep_setup_requires_new_setup(client):
    assert _setup(client).status_code == 200
    response = client.post(
        "/api/interview/reset?session_id=interview-1&keep_setup=false"
    )
    assert response.status_code == 200
    restored = client.get("/api/interview/session?session_id=interview-1").json()
    assert restored["configured"] is False


def test_message_limit_is_enforced(client, monkeypatch):
    monkeypatch.setenv("INTERVIEW_MESSAGE_LIMIT", "1")
    assert _setup(client).status_code == 200
    with patch("app.api.interview.generate_turn", return_value=(_turn_payload(), None)):
        with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
            first = client.post(
                "/api/interview/chat",
                data={"session_id": "interview-1", "text": "First answer."},
            )
            second = client.post(
                "/api/interview/chat",
                data={"session_id": "interview-1", "text": "Second answer."},
            )
    assert first.status_code == 200
    assert second.status_code == 429


def test_audio_turn_saves_recording_and_transcribes(
    client, isolate_interview_audio_dirs
):
    assert _setup(client).status_code == 200
    with patch("app.api.interview.transcribe_recording", return_value="My spoken answer"):
        with patch("app.api.interview.generate_turn", return_value=(_turn_payload(), None)):
            with patch("app.api.interview.synthesize_to_url", new=AsyncMock(return_value=None)):
                response = client.post(
                    "/api/interview/chat",
                    data={"session_id": "interview-1"},
                    files={"audio": ("answer.webm", b"fake audio bytes", "audio/webm")},
                )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user_text"] == "My spoken answer"
    assert payload["user_audio_url"].startswith("/static/audio/stt/int_stt_")
    saved_name = payload["user_audio_url"].split("/")[-1]
    assert (isolate_interview_audio_dirs[1] / saved_name).exists()
