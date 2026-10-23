# AI Coach — Product and Technical Spec

Current implementation spec for the AI Coach demo: an English conversation
coach and an Interview Coach, both with text and audio, served by a Next.js
frontend and a FastAPI backend.

Stack: Next.js 14 (App Router, TypeScript, CSS Modules) + FastAPI (Python
3.11+, uv-managed) + LLM routing through OmniRoute.

---

## 1. Product definition

### 1.1 What the user sees

The root page (`/`) is a coach selector with two cards:

- **English Coach** (`/english`) — free-form English conversation practice
  with CEFR-aware corrections.
- **Interview Coach** (`/interview`) — a tailored mock interview based on a
  job offer, with feedback after every answer.

Both interfaces use the same dark/light forest-green design, responsive chat
shell and text-plus-audio message contract. Each coach has its own session and
message limit. The top-left of both coach headers links back to `/`; there are
no cross-coach switcher buttons.

### 1.2 Input/output format contract

| User sends | Pipeline | User sees in chat | Backend sees |
|---|---|---|---|
| Text | TTS (text → audio) | Text + audio | Text + audio |
| Audio | STT (audio → text) + original recording | Text + audio | Text + audio |

The coach reply is always text, plus TTS audio when an engine is available.
Audio is best-effort: if every TTS engine fails, the turn still succeeds with
text and no audio URL. Audio failures never turn a chat turn into HTTP 500.

### 1.3 English Coach

The English Coach is a backend agent that:

1. Continues the conversation naturally in English.
2. Detects errors in the student's message and returns a structured list.
3. Grades each error with a CEFR level (A1–C2).
4. Returns only corrections at or below the student's selected level.

The English UI shows:

- A topbar with the **AI Coach Home** link, theme toggle, CEFR level selector,
  demo-usage indicator and an **All Corrections** button.
- A WhatsApp-style message list with text and an inline audio player when
  available.
- A live "Corrections for last message" panel.
- An **All Corrections** modal with sorting, pagination and PDF export.
- A composer with text input, hold-to-record mic, Enter-to-send and a reset
  action once the conversation has started.

The CEFR level is stored per session. The default level is `A1`. Changing it
affects subsequent turns; the backend filters corrections before returning
them.

### 1.4 Interview Coach

The Interview Coach runs a tailored practice interview for a real job offer.
The setup modal is mandatory on first entry. The user pastes an offer or
uploads `.txt`, `.md`, `.pdf` or `.docx` (up to 5 MB), then chooses:

| Stage | ID | Focus |
|---|---|---|
| Introduction | `intro` | Career story, relevance, motivation, communication and fit. |
| Technical | `technical` | Correctness, depth, design, trade-offs, testing, failure modes and handling unknowns. |
| Final | `final` | Ownership, measurable impact, conflict, failure, leadership, prioritisation and closing. |

The technical stage adapts to the inferred role track: software engineering,
data, AI/ML, architecture or technical lead. The role title, company,
seniority, key skills and offer digest are inferred from the offer. If the LLM
is unavailable, heuristic extraction keeps the interview usable.

Each answer receives:

- an in-character interviewer reply (the next question),
- a 1–5 answer score,
- coaching notes with category, severity, evidence, issue, why it matters and
  a concrete stronger answer.

**End interview** generates a practice report with an overall score, readiness
label (`not_ready`, `getting_there`, `interview_ready`), summary, strengths,
gaps and next steps. Readiness is a practice signal, not a hire/no-hire
decision.

---

## 2. Technical architecture

### 2.1 Repository layout

```
frontend/
  app/page.tsx                 landing
  app/english/                 English Coach route
  app/interview/               Interview Coach route
  components/chat/             shared chat primitives
  components/Topbar.tsx        English header
  components/Interview*.tsx    interview setup/feedback/report UI
  hooks/                       recorder, session id, theme
  lib/                         API clients and localStorage session helper
  types/                       shared TypeScript models
  __tests__/                   Jest + Testing Library

backend/
  app/api/                     chat, level, corrections, conversation,
                               settings, health, interview routers
  app/interview/               store, offer parser, LLM orchestration,
                               prompts and stage-specific skills
  app/main.py                  app assembly, /api/config, static audio mount
  app/session.py               English in-memory session store
  app/llm.py                   provider dispatch and fallbacks
  app/stt.py                   faster-whisper transcription
  app/tts.py                   edge-tts + Google TTS fallback
  app/filter.py                CEFR correction filter
  app/audio_janitor.py         stale-audio cleanup
  tests/                       pytest suites
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for diagrams and request flows.

### 2.2 Frontend

- Next.js App Router with three routes: `/`, `/english`, `/interview`.
- Shared chat primitives live in `components/chat/`; the two coach pages adapt
  their API models to `ChatMessageView` and provide their own panels/actions.
- `components/chat/CoachHeader.tsx` provides the shared header layout with a
  left back slot and right action slot. Each coach renders **← AI Coach Home**
  and the theme toggle there.
- Sessions are browser-generated UUIDs stored in `localStorage`:
  - English: `ai-coach-session-id`
  - Interview: `ai-interview-session-id`
- `NEXT_PUBLIC_API_URL` defaults to empty, so browser requests use relative
  `/api/*` URLs. Next.js rewrites them to `BACKEND_URL` (default
  `http://backend:8091`).

### 2.3 Backend

FastAPI routers:

| Router | Prefix |
|---|---|
| `api/chat.py` | `/api/chat` |
| `api/level.py` | `/api/level` |
| `api/corrections.py` | `/api/corrections` |
| `api/conversation.py` | `/api/conversation` |
| `api/settings.py` | `/api/settings` |
| `api/health.py` | `/api` |
| `api/interview.py` | `/api/interview` |
| app-level | `/api/config` |

`app/main.py` also mounts `/static` so generated audio and uploaded recordings
are available under `/static/audio/` and `/static/audio/stt/`. CORS is enabled
for all origins in the current demo.

### 2.4 Audio pipeline

1. Text input: synthesize the user text, then run the LLM and synthesize the
   coach reply.
2. Audio input: save the original recording, transcribe it with
   faster-whisper (`base`, CPU, int8), run the LLM and synthesize the coach
   reply.
3. TTS order: edge-tts (`en-US-AriaNeural`) → Google Translate TTS (chunked).
4. If both TTS engines fail, return text with no audio URL.
5. STT failure returns a controlled `502`; unsupported MIME types return `422`.

The audio janitor deletes `.mp3`, `.wav` and `.webm` files older than
`AUDIO_MAX_AGE_SECONDS` every `AUDIO_CLEANUP_INTERVAL_SECONDS`.

### 2.5 LLM contract and fallback

English turns request JSON with:

```json
{
  "reply": "Sounds good! Have you tried...?",
  "corrections": [
    {
      "original_phrase": "I have went to the store",
      "corrected_phrase": "I have gone to the store",
      "explanation": "After 'have', use the past participle 'gone', not the simple past 'went'.",
      "error_level": "A2",
      "category": "grammar"
    }
  ]
}
```

The backend validates the JSON, filters corrections by CEFR level and stores
them for the history endpoint. Malformed JSON is retried once; if it is still
malformed, the API returns `502`.

Provider defaults:

```python
{"provider": "omniroute", "model": "auto/best-chat"}
```

- OmniRoute 401/404 retries once with `OMNIROUTE_DEFAULT_COMBO_FALLBACK`
  (default `primary-chain`).
- Transport errors, missing keys and other provider failures fall back to
  MiniMax when `MINIMAX_API_KEY` is set, then to the rule-based offline coach.
- Fallback responses include `X-Fallback` with the reason.
- `/api/health` reports `omniroute.ok = false` and an aggregate `degraded`
  status when the gateway is unreachable.

### 2.6 Session state and limits

English:

- In-memory `SessionStore`, keyed by browser session id.
- Default CEFR level `A1`.
- Latest 10 messages retained for LLM context.
- Settings (provider/model) stored per session.
- Correction history is a separate in-memory store.
- `POST /api/conversation/reset` clears messages; the frontend also clears its
  visible messages and correction list. The correction store is cleared on
  backend restart.
- No TTL eviction is currently implemented; sessions live for the backend
  process lifetime.

Interview:

- Separate `InterviewStore`, keyed by its own session id.
- Latest 64 messages retained.
- Candidate answer count tracked separately.
- Feedback, scores, strengths and report stored per session.
- `INTERVIEW_MESSAGE_LIMIT` default `20`, `-1` unlimited.
- Sessions are cleared by backend restart or an interview reset.

Demo limits:

- `DEMO_MESSAGE_LIMIT` default `5`; `-1` unlimited.
- The English UI disables input at the cap and the backend returns `429`.
- `GET /api/config` exposes the runtime limit so the frontend does not need a
  rebuild when the environment changes.

---

## 3. API spec

### 3.1 Core endpoints

#### `GET /api/health`

Returns `200` with aggregated status:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "checks": {
    "session_store": {"ok": true},
    "audio_writable": {"ok": true},
    "omniroute": {"ok": true},
    "tts_import": {"ok": true, "engine": "edge-tts", "fallback": "google-tts"},
    "stt_import": {"ok": true, "engine": "faster-whisper"},
    "database": {"ok": true}
  }
}
```

`status` is `degraded` when any check reports `ok: false`; the endpoint itself
still returns `200`.

#### `GET /api/config`

```json
{"demo_message_limit": 5, "unlimited": false}
```

#### `POST /api/chat`

Multipart form:

- `session_id` (required, string)
- `text` (optional, string) — exactly one of `text` or `audio`
- `audio` (optional, file) — exactly one of `audio` or `text`

Response:

```json
{
  "session_id": "...",
  "user_text": "I goed to the market",
  "user_audio_url": "/static/audio/stt/stt_<uuid>.webm",
  "coach_text": "Nice try! The past of 'go' is 'went'.",
  "coach_audio_url": "/static/audio/<uuid>.mp3",
  "corrections": [
    {
      "original_phrase": "I goed",
      "corrected_phrase": "I went",
      "explanation": "Use the past simple 'went'.",
      "error_level": "A2",
      "category": "grammar",
      "severity": "minor"
    }
  ]
}
```

Errors:

- `400` — neither or both of `text`/`audio` supplied.
- `422` — unsupported audio MIME type.
- `429` — demo message limit reached.
- `502` — STT failure or malformed LLM JSON after one retry.
- OmniRoute transport failure — `200` with `X-Fallback` and a fallback reply.

#### `GET/POST /api/level?session_id=...`

`GET` returns the current level. `POST` accepts:

```json
{"level": "B1"}
```

Valid levels: `A1`, `A2`, `B1`, `B2`, `C1`, `C2`.

#### `GET /api/corrections?session_id=...&limit=20&offset=0`

Returns `{"corrections": [...], "total": n}`. `limit` must be between 1 and
100; `offset` must be non-negative.

#### `GET /api/conversation/summary?session_id=...`

Returns a one-paragraph summary, or a placeholder when there is no
conversation.

#### `POST /api/conversation/reset?session_id=...`

Clears the English conversation messages for the session.

#### `GET /api/settings?session_id=...`

Returns the stored provider/model. `POST /api/settings` accepts:

```json
{"session_id": "...", "provider": "omniroute", "model": "auto/best-coding"}
```

The backend supports `omniroute`, `minimax`, `openai`, `anthropic` and `groq`
providers. Unknown providers return `422`.

### 3.2 Interview endpoints

All routes are prefixed with `/api/interview`. The session id is sent as a
query parameter on GET routes and as a form field on mutations.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/skills` | List stages and the current answer limit. |
| `POST` | `/setup` | Multipart: `session_id`, `interview_type`, and `job_text` or `job_file`. Returns the brief and opening message. |
| `GET` | `/session?session_id=...` | Restore messages, feedback, scores and report. |
| `POST` | `/chat` | Multipart: `session_id` and one of `text`/`audio`. Returns interviewer reply, score and feedback. |
| `GET` | `/feedback?session_id=...&limit=20&offset=0` | Paginated feedback history. |
| `POST` | `/report?session_id=...` | Generate and store the end-of-interview report. |
| `POST` | `/reset?session_id=...&keep_setup=true` | Clear progress; `keep_setup=false` requires a new setup. |

Interview errors include `400` for invalid input combinations, `409` when the
interview is not configured, `413` for oversized uploads, `422` for invalid
offers or audio MIME types, `429` at the answer limit, and `502` for
transcription failures.

---

## 4. Frontend behavior and design

- Shared forest-green palette defined in `app/globals.css`; typography uses
  Plus Jakarta Sans with system fallbacks.
- CSS Modules for component and page styles. No Tailwind or SWR.
- Responsive layout: the landing cards stack on small screens; the composer,
  level selector and header actions adapt to mobile.
- Theme is persisted in `localStorage` via `useTheme`.
- Every message bubble renders its text and, when available, an inline audio
  player. Audio playback is optional; text is always present.
- The composer sends text on Enter and supports Shift+Enter for a newline.
  Holding the mic records and releases to send.
- Accessibility: labelled controls, keyboard-dismissable modals, visible
  focus states and semantic buttons.

---

## 5. Configuration, deployment and testing

### Configuration

| Variable | Default |
|---|---|
| `OMNIROUTE_BASE_URL` | `http://localhost:8082/v1` (code) / `http://host.docker.internal:20128/v1` (Compose) |
| `OMNIROUTE_API_KEY` | empty |
| `OMNIROUTE_DEFAULT_MODEL` | `auto/best-chat` (code) / `demo-combo` (Compose) |
| `OMNIROUTE_DEFAULT_COMBO_FALLBACK` | `primary-chain` |
| `MINIMAX_API_KEY` | empty |
| `DEMO_MESSAGE_LIMIT` | `5` (`-1` unlimited) |
| `INTERVIEW_MESSAGE_LIMIT` | `20` (`-1` unlimited) |
| `AUDIO_CLEANUP_INTERVAL_SECONDS` | `3600` |
| `AUDIO_MAX_AGE_SECONDS` | `3600` |
| `NEXT_PUBLIC_API_URL` | empty (same-origin) |
| `BACKEND_URL` | `http://backend:8091` |

### Deployment

- `docker compose up -d --build` starts the two-service stack.
- Host ports: backend `18100` → `8091`, frontend `18101` → `3000`.
- `start.sh` is the single-container PaaS variant (backend `8091`, frontend
  `$PORT`, default `10000`).
- The frontend rewrite proxies `/api/*`, `/static/audio/*` and `/audio/*`.

### Testing

```bash
cd backend && uv run pytest -v
cd frontend && npm test
cd frontend && npm run build
make e2e                 # optional Playwright harness
```

---

## 6. Non-goals and limitations

- No database or durable conversation history. Backend restarts clear
  sessions, corrections, interview feedback and reports.
- No authentication or multi-user isolation beyond separate browser session
  ids.
- No streaming LLM responses; replies arrive as complete JSON turns.
- No guarantee that OmniRoute or TTS providers are available. The app degrades
  to MiniMax/offline coaching or text-only turns instead of failing the chat.
- Interview readiness is practice feedback, not a hiring decision.
- `specs/` contains historical feature notes; it is not part of the current
  runtime contract.
