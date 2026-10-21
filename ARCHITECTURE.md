# Architecture

## Component diagram

```
Browser (3000)          FastAPI (8091)          OmniRoute          Upstream LLM
     │                        │                      │                    │
     │──── chat message ─────►│                      │                    │
     │                        │──── chat completion ──►│                    │
     │                        │◄─── response ────────│                    │
     │◄──── HTML / JSON ─────│                      │                    │
```

### Audio flow

```
Mic → MediaRecorder → multipart POST /api/chat → faster-whisper STT
                                                      │
                                                      ▼
                                              LLM (OmniRoute)
                                                      │
                                                      ▼
                                              edge-tts TTS
                                                      │
                                                      ▼
                                              /static/audio/*.mp3
                                                      │
                                                      ▼
                                              HTML5 <audio> in browser
```

## Request flow for one chat round

1. **User sends a message** (text via input field, or audio via hold-to-record mic button).
2. **Frontend POSTs** to `/api/chat` with `text` (and/or `audio` as multipart).
3. **STT** (faster-whisper, CPU): if audio is present, transcribed to `user_text`.
4. **LLM call** (via OmniRoute): `user_text` sent with system prompt + CEFR level.
   Returns `{reply, corrections: [{original_phrase, corrected_phrase, explanation, error_level, category, severity}]}`.
5. **Level filtering** (backend): drop corrections with `error_level` above user's CEFR level.
6. **TTS** (edge-tts): `reply` → `coach_audio_url` served at `/static/audio/<uuid>.mp3`.
   If audio input was present, also TTS `user_text` → `user_audio_url`.
7. **Response** returned to frontend as JSON.
8. **Frontend renders**: user/coach bubbles appear, corrections panel updates, audio plays automatically.

## Session state

Session data is held in an in-memory dict keyed by `session_id` (UUID, stored in a cookie):

```python
{
    "session_id": str,
    "level": "A2",          # CEFR level: A1, A2, B1, B2, C1, C2
    "messages": [            # list of {role, text}
        {"role": "user", "text": "I goed to the store"},
        {"role": "coach", "text": "I went to the store. Good try!"},
    ],
    "corrections": [         # all corrections in chronological order
        {
            "original_phrase": "I goed",
            "corrected_phrase": "I went",
            "explanation": "Use the past simple 'went' after a past time expression",
            "error_level": "A2",
            "category": "grammar",
            "severity": "minor",
            "timestamp": "2026-09-05T10:00:00Z",
        },
    ],
}
```

`POST /api/conversation/reset` clears `messages` and `corrections` for the session, keeping the `level`.

## Interview Coach

The Interview Coach is a second frontend route (`/interview`) backed by a
separate FastAPI router (`/api/interview`). It deliberately does not share
session state with the English coach.

### Backend layout

```
backend/app/interview/
├── models.py            # Pydantic request/response models
├── store.py             # InterviewStore + per-session state
├── offer.py             # txt/md/pdf/docx extraction + heuristic brief
├── llm.py               # brief, turn and report orchestration
├── prompts.py           # shared rules, JSON contracts, prompt builders
├── audio.py             # interview STT/TTS helpers
└── skills/
    ├── base.py          # InterviewSkill dataclass + system prompt
    ├── introduction.py  # intro stage rubric and question plan
    ├── technical.py     # technical rubric + role-track guidance
    └── final.py         # hiring-manager rubric
```

`skills/base.py` renders one system prompt per turn from the skill's persona,
objective, question plan, evaluation dimensions, common mistakes, role-track
guidance and score guide. The shared rules and JSON contract live in
`prompts.py`.

### Setup flow

1. The browser shows a mandatory setup modal on `/interview`.
2. The user pastes an offer or uploads `.txt`, `.md`, `.pdf` or `.docx`
   (max 5 MB) and selects `intro`, `technical` or `final`.
3. The backend extracts text, cleans it and asks the LLM for a structured
   brief: role title, company, seniority, track, key skills, digest and an
   opening message.
4. If the LLM is unavailable, `offer.heuristic_brief()` extracts the same
   fields with regex/keyword rules and the stage's `fallback_opening` is used.
5. The opening message is stored as the first interviewer turn and TTS is
   attempted; TTS failure is non-fatal.
6. The role brief and offer are stored in the interview session, not in the
   English session.

### One interview turn

```
Candidate text/audio
        │
        ▼
POST /api/interview/chat (multipart)
        │
        ├── audio → faster-whisper STT ──► candidate text (+ saved recording URL)
        │
        ├── text  → edge-tts TTS ────────► candidate audio URL (best-effort)
        │
        ▼
InterviewStore appends candidate message
        │
        ▼
LLM (skill system prompt + full interview history)
        │
        ▼
{ interviewer_reply, answer_score, strengths, feedback[] }
        │
        ├── normalize categories/severities and field aliases
        ├── clamp score to 1–5
        ├── store feedback + score + strengths
        ├── edge-tts TTS for interviewer_reply (best-effort)
        ▼
InterviewStore appends interviewer message
        │
        ▼
Frontend: interviewer bubble + live feedback panel
```

The interviewer reply is the next question in character. Coaching feedback is
returned alongside it and is never spoken by the interviewer.

### Session state

`InterviewStore` is keyed by `session_id` from
`localStorage["ai-interview-session-id"]` and holds:

```python
{
    "interview_type": "technical",
    "offer_text": "...",
    "brief": {
        "role_title": "Senior Backend Engineer",
        "company": "Acme",
        "seniority": "senior",
        "role_track": "software_engineering",
        "key_skills": ["Python", "AWS"],
        "offer_digest": "...",
    },
    "opening_message": "...",
    "messages": [
        {"role": "interviewer", "text": "...", "audio_url": "..."},
        {"role": "candidate", "text": "...", "audio_url": "..."},
    ],
    "feedback": [
        {
            "id": "...",
            "turn": 1,
            "question": "...",
            "category": "impact",
            "severity": "major",
            "evidence": "...",
            "issue": "...",
            "why_it_matters": "...",
            "better_answer": "...",
            "timestamp": "...",
        },
    ],
    "strengths": ["..."],
    "turn_scores": [{"turn": 1, "score": 3, "strengths": ["..."]}],
    "report": {...},
}
```

Conversation messages are capped at 64 by `MAX_INTERVIEW_MESSAGES`; candidate
answers are capped by `INTERVIEW_MESSAGE_LIMIT` (default 20, `-1` unlimited).
Feedback history is returned newest-first for the history modal; the session
restore endpoint returns it chronologically.

### End-of-interview report

`POST /api/interview/report` sends the transcript, the recorded feedback and
the per-turn scores to the LLM. The response contains an overall score (1–5),
a practice readiness label (`not_ready`, `getting_there`, `interview_ready`),
a summary, strengths, gaps and next steps. If the LLM is unavailable, a
rule-based report is built from the same session data. Readiness is a practice
signal, not a hiring decision.

### Frontend

```
app/interview/page.tsx                 # state, send/record, end/reset
components/InterviewSetupModal.tsx     # mandatory offer + stage modal
components/InterviewTopbar.tsx         # role, stage, feedback/report actions
components/InterviewFeedbackPanel.tsx  # live per-answer coaching
components/InterviewFeedbackModal.tsx  # full feedback history by turn
components/InterviewReportModal.tsx    # final practice report
lib/interview-api.ts                   # fetch wrappers
types/interview.ts                     # shared TypeScript types
```

Audio and text input reuse the same MediaRecorder and `AudioPlayer`
components as the English coach. The chat layout reuses
`app/chat.module.css`, while interview-specific styling lives in dedicated CSS
modules.
