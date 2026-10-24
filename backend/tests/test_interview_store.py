"""Unit tests for the interview session store."""

from app.interview.store import InterviewStore

BRIEF = {
    "role_title": "Senior Backend Engineer",
    "company": "Acme",
    "seniority": "senior",
    "role_track": "software_engineering",
    "key_skills": ["Python"],
    "offer_digest": "Build services.",
}


def _configured_store() -> InterviewStore:
    store = InterviewStore()
    store.setup("s1", "technical", "offer", BRIEF, "Opening question")
    return store


def test_answer_count_survives_message_trimming_and_enforces_limit(monkeypatch):
    monkeypatch.setenv("INTERVIEW_MESSAGE_LIMIT", "30")
    monkeypatch.setattr("app.interview.store.MAX_INTERVIEW_MESSAGES", 24)
    store = _configured_store()

    for index in range(15):
        store.append_message("s1", "candidate", f"Answer {index}")
        store.append_message("s1", "interviewer", f"Question {index}")

    assert store.get_answer_count("s1") == 15
    assert len(store.get_messages("s1")) <= 24
    assert store.is_at_limit("s1") is False

    for index in range(15, 30):
        store.append_message("s1", "candidate", f"Answer {index}")

    assert store.get_answer_count("s1") == 30
    assert store.is_at_limit("s1") is True


def test_reset_keep_setup_restores_opening_and_clears_count():
    store = _configured_store()
    store.append_message("s1", "candidate", "Answer")
    store.append_message("s1", "interviewer", "Question")
    store.add_evaluation(
        "s1",
        feedback=[],
        score=3,
        strengths=["Ownership"],
        turn=1,
    )
    store.save_report("s1", {"overall_score": 3.0})

    store.reset("s1", keep_setup=True)

    assert store.get_answer_count("s1") == 0
    assert store.is_configured("s1") is True
    assert store.get_messages("s1")[0]["text"] == "Opening question"
    assert len(store.get_messages("s1")) == 1
    assert store.get_report("s1") is None


def test_reset_without_keep_setup_forgets_brief():
    store = _configured_store()
    store.reset("s1", keep_setup=False)
    assert store.is_configured("s1") is False
    assert store.get_brief("s1") is None
    assert store.get_messages("s1") == []
