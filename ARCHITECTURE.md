# Architecture

AI Coach is a Next.js frontend and a FastAPI backend. The frontend exposes a
coach-selection landing page and two independent practice interfaces; the
backend owns LLM prompts, CEFR filtering, speech services, audio files and
in-memory sessions.

## Repository layout

```
.
├── frontend/
│   ├── app/
│   │   ├── page.tsx                 / — landing and coach selector
│   │   ├── landing.module.css
│   │   ├── english/                 /english — English Coach
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── corrections.module.css
│   │   ├── interview/               /interview — Interview Coach
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── interview.module.css
│   │   ├── layout.tsx               root metadata, fonts, theme bootstrap
│   │   └── globals.css              design tokens and base styles
│   ├── components/
│   │   ├── chat/                    shared chat primitives
│   │   ├── icons/                   shared SVG icon components
│   │   ├── Topbar.tsx               English header and level controls
│   │   ├── InterviewTopbar.tsx      Interview header and actions
│   │   ├── Interview*.tsx           setup, feedback and report UI
│   │   └── ErrorsModal.tsx          correction history and PDF export
│   ├── hooks/                       recorder, stored session id, theme
│   ├── lib/                         browser API clients and session storage
│   ├── types/                       English and interview types
│   └── __tests__/                   Jest + Testing Library
├── backend/
│   ├── app/
│   │   ├── api/                     HTTP routers
│   │   ├── interview/               interview store, offer parser, prompts
│   │   │   └── skills/              intro, technical and final rubrics
│   │   ├── main.py                  FastAPI app, /api/config, static mount
│   │   ├── session.py               English in-memory session store
│   │   ├── llm.py                   provider dispatch and fallback chain
│   │   ├── stt.py                   faster-whisper transcription
│   │   ├── tts.py                   edge-tts + Google TTS fallback
│   │   ├── filter.py                CEFR correction filtering
│   │   └── audio_janitor.py         periodic stale-audio cleanup
│   ├── tests/                       pytest suites
│   └── pyproject.toml
├── docs/                            guides and screenshots
├── specs/                           historical feature specs
├── docker-compose.yml               backend + frontend stack
├── Dockerfile.backend
├── Dockerfile.frontend
├── start.sh                         single-container PaaS launcher
├── Makefile                         `make e2e`
└── scripts/e2e.sh                   Playwright harness
```

## Runtime topology

```
Browser
  │
  ├── HTTPS ──► Next.js (host 18101 → container 3000)
  │                │
  │                ├── /, /english, /interview
  │                └── rewrites /api/*, /static/audio/* and /audio/*
  │                            │
  ▼                            ▼
localStorage              FastAPI (host 18100 → container 8091)
session ids                    │
                               ├── OmniRoute / OpenAI-compatible gateway
                               ├── MiniMax fallback (optional)
                               ├── faster-whisper STT
                               ├── edge-tts → Google TTS fallback
                               └── in-memory session stores
```

In local development the frontend can call the backend directly through
`NEXT_PUBLIC_API_URL=http://localhost:8091`. In Docker the default is an empty
`NEXT_PUBLIC_API_URL`, so the browser uses same-origin relative URLs and the
Next.js rewrite forwards `/api/*` to `BACKEND_URL` (default
`http://backend:8091`).

## Frontend

### Routes and navigation

```
/                 Coach landing (same forest-green shell)
                  ├── /english   English Coach
                  └── /interview Interview Coach
```

Both coach pages share `components/chat/`. The shared `CoachHeader` renders a
left `headerBack` slot and a right `headerActions` slot; each coach fills them
with a **← AI Coach Home** link and the theme toggle. There are no cross-coach
switcher buttons in the headers. Returning to `/` and choosing a card is the
only way to change coaches.

Session ids are generated with `crypto.randomUUID()` and stored in
`localStorage` per coach:

| Coach | Storage key | Frontend helper |
|---|---|---|
| English | `ai-coach-session-id` | `lib/session.ts` / `useStoredSessionId` |
| Interview | `ai-interview-session-id` | `lib/session.ts` / `useStoredSessionId` |

### Shared chat UI

```
components/chat/ChatShell.tsx             atmospheric page, rounded window, main column
components/chat/CoachHeader.tsx           brand, title, subtitle, back/actions, session banner
components/chat/HeaderControls.module.css shared pills, icon buttons, badges, back link
components/chat/ChatMessageList.tsx       scroll area, auto-scroll and empty state
components/chat/ChatMessage.tsx           avatars, speaker, timestamp, bubble and audio
components/chat/ChatComposer.tsx          input, mic button, send button, reset action
components/chat/ChatEmptyState.tsx        shared empty/loading presentation
components/chat/ChatErrorBanner.tsx       shared dismissible error banner
components/chat/AudioPlayer.tsx           waveform audio player
components/chat/LoadingIndicator.tsx      configurable thinking indicator
components/chat/chat.module.css           shared forest-green chat design
components/chat/types.ts                  ChatMessageView and action types
components/chat/index.ts                  public exports
components/icons/AppIcons.tsx             leaf, book, briefcase, robot and user icons
hooks/useAudioRecorder.ts                 hold-to-record MediaRecorder flow
hooks/useStoredSessionId.ts               per-coach localStorage session id
hooks/useTheme.ts                         dark/light theme toggle
lib/session.ts                            session-id storage helper
```

Pages adapt their API models into `ChatMessageView` objects and pass copy,
state, actions and coach-specific panels. Improving a bubble, audio block,
composer or shared style updates both coaches at once.

### Coach-specific pages

| File | Responsibility |
|---|---|
| `app/page.tsx` | Landing cards, theme toggle and links to each coach. |
| `app/english/page.tsx` | English chat, CEFR level, live corrections, reset, demo-limit state and `ErrorsModal`. |
| `app/english/corrections.module.css` | Live correction panel styling. |
| `app/interview/page.tsx` | Interview setup, send/record turn, live feedback, end/reset and report state. |
| `app/interview/interview.module.css` | Interview layout and panels. |
| `components/Topbar.tsx` | English header: home link, theme toggle, level selector, corrections button and usage pill. |
| `components/InterviewTopbar.tsx` | Interview header: home link, theme toggle, stage badge, feedback, end and new-interview actions. |
| `components/InterviewSetupModal.tsx` | Mandatory offer/stage setup and home fallback link. |
| `components/InterviewFeedbackPanel.tsx` | Latest-answer coaching. |
| `components/InterviewFeedbackModal.tsx` | Full feedback history grouped by turn. |
| `components/InterviewReportModal.tsx` | Final practice report. |
| `components/ErrorsModal.tsx` | Paginated English correction history and PDF export. |
| `lib/api.ts` | English API client. |
| `lib/interview-api.ts` | Interview API client. |
| `types/index.ts` / `types/interview.ts` | Shared TypeScript models. |

## Backend

### Application assembly

`app/main.py` creates the FastAPI app, enables permissive CORS, starts the
audio janitor in the lifespan handler, exposes `GET /api/config`, and mounts
the audio tree:

```
/static/audio/       generated TTS MP3 files
/static/audio/stt/   original user recordings
```

Routers:

| Router | Prefix | Main routes |
|---|---|---|
| `api/health.py` | `/api` | `GET /health` |
| `api/chat.py` | `/api/chat` | `POST ""` |
| `api/level.py` | `/api/level` | `GET ""`, `POST ""` |
| `api/corrections.py` | `/api/corrections` | `GET ""` |
| `api/conversation.py` | `/api/conversation` | `GET /summary`, `POST /reset` |
| `api/settings.py` | `/api/settings` | `GET ""`, `POST ""` |
| `api/interview.py` | `/api/interview` | skills, setup, session, chat, feedback, report, reset |
| app-level | `/api/config` | demo message limit |

### English chat flow

1. The user sends text or an audio recording from `/english`.
2. The frontend POSTs multipart form data to `/api/chat` with `session_id` and
   exactly one of `text` or `audio`.
3. If audio is present, the original recording is saved under
   `/static/audio/stt/`, then faster-whisper (`base`, CPU, int8) transcribes
   it to `user_text`. STT failure returns a controlled `502`.
4. If text is present, the backend synthesizes the user text to audio so the
   user bubble also has playback. Audio is best-effort.
5. The demo limit is enforced before STT/TTS work; an over-limit turn returns
   `429`.
6. The backend appends the user message to the English session and calls the
   LLM with the system prompt, full available history and the selected CEFR
   level.
7. Corrections are filtered to the user's level and stored in the separate
   correction-history store.
8. The coach reply is synthesized with edge-tts, then Google TTS if Edge is
   blocked. If both fail, the response still returns `200` with text and a
   missing audio URL.
9. The response contains `session_id`, `user_text`, `user_audio_url`,
   `coach_text`, `coach_audio_url` and `corrections`. OmniRoute fallbacks add an
   `X-Fallback` header.

### Audio pipeline

```
Mic → MediaRecorder → multipart POST /api/chat
                              │
                              ├── audio input
                              │     ├── save original recording
                              │     └── faster-whisper STT → user text
                              │
                              └── text input
                                    └── edge-tts / Google TTS → user audio

LLM reply
   │
   ▼
edge-tts (en-US-AriaNeural)
   │ failure (for example upstream 403)
   ▼
Google Translate TTS (chunked)
   │ failure
   ▼
text-only response (no audio URL)
```

Generated audio is served as `/static/audio/<uuid>.mp3`. The janitor runs in
the FastAPI lifespan task and deletes `.mp3`, `.wav` and `.webm` files older
than `AUDIO_MAX_AGE_SECONDS` (default one hour) every
`AUDIO_CLEANUP_INTERVAL_SECONDS` (default one hour).

### English session state

`app/session.py` keeps a process-local `SessionStore` keyed by `session_id`:

```python
{
    "session_id": str,
    "level": "A1",            # default CEFR level
    "messages": [             # capped at MAX_MESSAGES = 10
        {"role": "user", "text": "I goed to the store"},
        {"role": "assistant", "text": "I went to the store. Good try!"},
    ],
    "settings": {"provider": "omniroute", "model": "auto/best-chat"},
    "last_activity": float,
}
```

The correction-history store in `api/corrections.py` is separate and keeps
paginated correction records per session. `POST /api/conversation/reset` calls
`SessionStore.reset`, which clears messages; the frontend also clears its
visible messages and correction list. The correction store is cleared only
when the backend process restarts. `last_activity` is recorded, but the current
demo does not run an idle-session eviction task.

### LLM dispatch and fallback

`app/llm.py` dispatches to OmniRoute, MiniMax, OpenAI, Anthropic or Groq
through the session settings. New sessions default to:

```python
{"provider": "omniroute", "model": "auto/best-chat"}
```

For OmniRoute, a 401/404 retries once with
`OMNIROUTE_DEFAULT_COMBO_FALLBACK`. Transport errors, missing credentials and
other provider failures are handled by `get_llm_reply`:

1. If the active provider is not MiniMax and `MINIMAX_API_KEY` is set, try
   MiniMax.
2. Otherwise use the local rule-based offline coach.
3. Return `X-Fallback` with the reason.

Malformed JSON is retried once; if it is still malformed, the API returns
`502` instead of silently inventing a reply. `/api/health` reports
`omniroute.ok = false` when the gateway's `/models` endpoint is unreachable,
which makes the aggregate status `degraded` without taking the app down.

## Interview Coach

The Interview Coach is a separate frontend route (`/interview`) backed by a
dedicated FastAPI router (`/api/interview`). It deliberately does not share
session state, limits or prompts with the English Coach.

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
guidance and score guide. Shared rules and the JSON contract live in
`prompts.py`.

### Setup flow

1. The browser shows a mandatory setup modal on `/interview`.
2. The user pastes an offer or uploads `.txt`, `.md`, `.pdf` or `.docx`
   (max 5 MB) and selects `intro`, `technical` or `final`.
3. The backend extracts and cleans the text, then asks the LLM for a
   structured brief: role title, company, seniority, track, key skills, digest
   and an opening message.
4. If the LLM is unavailable, `offer.heuristic_brief()` extracts the same
   fields with regex/keyword rules and the stage's fallback opening is used.
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
        ├── audio → faster-whisper STT → candidate text (+ saved recording URL)
        │
        ├── text  → edge-tts / Google TTS → candidate audio URL (best-effort)
        │
        ▼
InterviewStore appends candidate message
        │
        ▼
LLM (skill system prompt + interview history)
        │
        ▼
{ interviewer_reply, answer_score, strengths, feedback[] }
        │
        ├── normalize categories/severities and field aliases
        ├── clamp score to 1–5
        ├── store feedback + score + strengths
        ├── edge-tts / Google TTS for interviewer_reply (best-effort)
        ▼
InterviewStore appends interviewer message
        │
        ▼
Frontend: interviewer bubble + live feedback panel
```

The interviewer reply is the next question in character. Coaching feedback is
returned alongside it and is never spoken by the interviewer.

### Interview session state

`InterviewStore` is keyed by the browser's `ai-interview-session-id` and holds:

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
    "answer_count": 1,
    "feedback": [...],
    "strengths": ["..."],
    "turn_scores": [{"turn": 1, "score": 3, "strengths": ["..."]}],
    "report": {...},
}
```

Conversation messages are capped at 64 by `MAX_INTERVIEW_MESSAGES`; candidate
answers are capped by `INTERVIEW_MESSAGE_LIMIT` (default 20, `-1` unlimited).
Feedback history is returned newest-first for the history modal; the session
restore endpoint returns it chronologically. `POST /api/interview/reset`
clears progress while keeping the offer and opening message by default; pass
`keep_setup=false` to require a new setup. A backend restart clears everything.

### End-of-interview report

`POST /api/interview/report` sends the transcript, recorded feedback and
per-turn scores to the LLM. The response contains an overall score (1–5), a
practice readiness label (`not_ready`, `getting_there`, `interview_ready`), a
summary, strengths, gaps and next steps. If the LLM is unavailable, a
rule-based report is built from the same session data. Readiness is a practice
signal, not a hiring decision.

## Configuration and deployment

| Concern | Local code default | Docker Compose default |
|---|---|---|
| Backend port | `8091` | container `8091`, host `18100` |
| Frontend port | `3000` | container `3000`, host `18101` |
| OmniRoute base URL | `http://localhost:8082/v1` | `http://host.docker.internal:20128/v1` |
| OmniRoute model | `auto/best-chat` | `demo-combo` |
| Combo fallback | `primary-chain` | `primary-chain` |
| English demo limit | `5` | `5` |
| Interview answer limit | `20` | `20` |
| Audio max age | `3600` seconds | `3600` seconds |

The two-service `docker-compose.yml` shares the source tree, uses separate
`Dockerfile.backend` and `Dockerfile.frontend` images, persists audio in named
volumes and health-checks both services. `start.sh` is the single-container
variant used by PaaS deployments: it starts uvicorn on `8091` and Next.js on
`$PORT` (default `10000`) inside one image.

The frontend build bakes `NEXT_PUBLIC_API_URL` into the bundle. Leave it empty
for Docker/production so the browser uses relative URLs and the Next.js
rewrites forward requests. Set `BACKEND_URL` when the backend is not reachable
at `http://backend:8091` from the Next.js server.

## Testing

- Backend: `cd backend && uv run pytest -v`
- Frontend: `cd frontend && npm test`
- Production build: `cd frontend && npm run build`
- Optional E2E: `make e2e` (`scripts/e2e.sh`, requires Playwright)

The test suites cover CEFR filtering, LLM JSON retries and fallbacks, OmniRoute
integration, message limits, audio janitor, TTS/STT error handling, health,
interview skills/store/API, and the shared chat components plus landing and
header navigation.
