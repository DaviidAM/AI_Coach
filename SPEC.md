# AI Coach — Spec (v2)

Voice + text AI English teacher with progressive correction by CEFR level (A1–C2).
Stack: Next.js 14 (frontend, TypeScript, Tailwind) + FastAPI (backend, Python, uv-managed) + LLM via MiniMax.
Deploy target: Render (`ai-coach-pnf5.onrender.com` currently runs the old Gradio version).

---

## 1. Product definition

### 1.1 What the user sees

A WhatsApp-style chat interface. The user types OR holds-to-records audio.
Whatever they send — text OR audio — is **always converted to both formats** before
reaching the COACH (the backend agent). The COACH replies in text, and the text
is **automatically converted to audio** that plays the moment the response arrives.

### 1.2 Input/output format contract

| User sends | Pipeline | User sees in chat | Backend sees |
|---|---|---|---|
| Text | TTS (text → audio) | Both text + audio (audio plays) | Both text + audio |
| Audio | STT (audio → text) | Both text + audio (audio plays) | Both text + audio |

**The COACH's reply**: text + auto-generated TTS audio. The audio plays automatically.

### 1.3 The COACH

The COACH is the backend agent. Behaviour:

1. **Continues the conversation** with the user (free-form, in English).
2. **Extracts errors** from the user's message. Each error has a CEFR level
   (A1/A2/B1/B2/C1/C2). Errors are graded; only errors at or below the user's
   selected level are shown.
3. Returns a structured response containing:
   - `reply`: the text the COACH says next (free-form).
   - `corrections`: list of errors detected, each with:
     - `original_phrase`: what the user wrote/said.
     - `corrected_phrase`: the corrected version.
     - `explanation`: short, clear explanation in English of the rule.
     - `error_level`: CEFR bucket (`A1`...`C2`).
     - `category`: optional taxonomy (`grammar`, `vocabulary`, `spelling`, `style`, `word_order`, ...).

### 1.4 Level filtering

The user selects an English level (A1–C2) in the top bar.

- If user level = B2 and error level = C1 → **do not show** (above user level).
- If user level = B2 and error level = B1 → **show** (at or below user level).
- Edge case: A1 = absolute beginner, only A1 errors shown. C2 = all errors shown.

Filtering happens in the backend, not the frontend, so the user can't inspect the
full payload.

### 1.5 Error display

Two places:

1. **Bottom of the chat (live panel)**: errors for the *current* message. Cleared
   when a new message is sent. Shows up to N corrections (default 5).
2. **Second tab (history)**: all errors from the whole conversation, in chronological
   order. Pagination 20 per page. Marked with timestamp.

---

## 2. Technical architecture

```
┌──────────────────────────────────────────────────────────┐
│  Next.js 14 (App Router, TypeScript, Tailwind, SWR)      │
│  /                   → Chat tab                          │
│  /?tab=feedback      → All-corrections tab               │
│  /api/*              → proxies to FastAPI                 │
└──────────────────────────┬───────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼───────────────────────────────┐
│  FastAPI (Python 3.11, managed with uv, pyproject.toml)  │
│                                                          │
│  /api/health                       GET  (liveness)       │
│  /api/chat                         POST (text or audio)  │
│  /api/corrections                  GET  (history)        │
│  /api/level                        POST (set CEFR)       │
│  /api/level                        GET  (current)        │
│  /api/conversation/reset           POST                  │
│  /api/conversation/summary         GET                   │
└──────────────────────────┬───────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
  STT (faster-whisper)  TTS (edge-tts or  LLM (MiniMax-M2.7-highspeed)
   audio → text          Piper TTS)        via chat completions
                        text → audio       returns {reply, corrections}
```

### 2.1 Backend deps

```
fastapi, uvicorn[standard], pydantic, pydantic-settings
httpx                   # LLM client
faster-whisper          # STT (CPU OK)
edge-tts                # TTS, free Microsoft Edge voices
python-multipart        # audio upload
APScheduler             # optional: scheduled feedback digest
pytest, pytest-asyncio  # dev
```

### 2.2 LLM call shape

The backend calls the LLM with a strict JSON response schema. The system prompt
defines the COACH persona + the error-grading rubric. Example payload:

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

If the LLM returns malformed JSON, the backend retries once with a "fix JSON"
prompt. If still malformed, returns 502 to the client with a sanitized message.

### 2.3 Level filtering (backend)

```python
CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

def filter_corrections(corrections: list, user_level: str) -> list:
    cutoff = CEFR_ORDER.index(user_level)
    return [c for c in corrections if CEFR_ORDER.index(c.error_level) <= cutoff]
```

### 2.4 Audio handling

- **Input**: client sends multipart with `text` (optional) and `audio` (optional).
  Exactly one of the two must be present.
- If `text`: backend generates TTS once to return alongside the COACH reply.
- If `audio`: backend runs STT (faster-whisper, base model, CPU) to get the text,
  generates TTS for the user's transcribed text (so the user sees/hears their own
  message rendered back), then calls the LLM, then generates TTS for the COACH's reply.
- **Output**: backend returns JSON `{user_text, user_audio_url, coach_text, coach_audio_url, corrections}`.
  Audio files are served as static files under `/static/audio/` with a UUID filename.

### 2.5 Audio playback

Frontend uses HTML5 `<audio autoplay>` on the coach's audio URL. Mobile browsers
require a user gesture before autoplay; we surface a small "Tap to enable audio"
CTA on first load that requests the necessary permission. The COACH audio plays
on every new message after that.

### 2.6 Conversation memory

Backend stores conversation state in-process (a dict keyed by session_id, stored
in a cookie). Each message is appended to a list. The LLM is called with the
last N messages (default N=10, configurable). Session expires after 30 min idle.

If you want persistence, switch the dict for SQLite — not required for v2.

---

## 3. Frontend spec

### 3.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│ 🎯 AI Coach  │ English · voice & text  │ [A2 ▼]  ☀/🌙 │ ← topbar (level + theme)
├──────────────────────────────────────────────────────────┤
│                                                          │
│  [user]  Hey coach, I goed to the market yesterday       │
│          🔊 (play)                                       │
│                                                          │
│  [coach] Great! What did you buy?                        │
│          🔊 (autoplay)                                   │
│                                                          │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  [ Live corrections for last message ]                   │
│  • "I goed" → "I went"  (A2 grammar)                     │
│  • "the market yesterday" → "...yesterday at the market" │
│    (B1 word order)                                       │
│                                                          │
│  [Hold to record 🎙]   [Type a message...     ] [Send ➤] │
└──────────────────────────────────────────────────────────┘
       Tab 1: Chat (above)  |  Tab 2: All corrections
```

### 3.2 Components

- `<Topbar>` — logo, brand, level selector (chips A1–C2), theme toggle (dark/light, persistent in localStorage).
- `<ChatList>` — message bubbles, user right + indigo accent, coach left + neutral, timestamp on hover.
- `<AudioBubble>` — play/pause button, waveform (optional), duration.
- `<CorrectionPanel>` — fixed bottom panel above the input row, list of corrections for the current message.
- `<MessageInput>` — text input + hold-to-record mic button. While holding: visual recording indicator.
- `<TabBar>` — Chat | Corrections-history.
- `<CorrectionHistory>` — full list of corrections for the session, paginated, with timestamps.

### 3.3 Design

- Daviid default palette: indigo `#6366F1` + cyan `#22D3EE` on `#0A0A0F` for dark, off-white for light.
- Font: Inter (UI) + JetBrains Mono (URLs, timestamps).
- Mobile-first: input row stacks, mic button full-width, level selector collapses to a dropdown under 480px.
- Light/dark toggle persisted in localStorage as `ai-coach-theme`.

### 3.4 Audio recording

Use `MediaRecorder` API on the browser. Output `audio/webm;codecs=opus` (or `audio/ogg` on Firefox).
While recording, show a pulsing red dot. On release, POST to `/api/chat` with `audio` multipart field.
If `MediaRecorder` is unavailable (very old browsers), fall back to file-upload picker.

### 3.5 Accessibility

- ARIA labels on all interactive elements.
- Keyboard shortcut: `Ctrl+Enter` to send text.
- Color contrast ≥ 4.5:1 for body text.
- axe-core sweep must pass before merge.

---

## 4. API spec (REST)

### `GET /api/health`

Always 200, body `{"status": "ok", "version": "x.y.z"}`. Used by stillalive-dashboard ping.

### `POST /api/chat`

Request (multipart):
- `text` (optional, string): text message from user.
- `audio` (optional, file): audio message from user.
- `session_id` (optional, string): conversation id, defaults to a new UUID.

Response:
```json
{
  "session_id": "...",
  "user_text": "...",
  "user_audio_url": "/static/audio/<uuid>.mp3",
  "coach_text": "...",
  "coach_audio_url": "/static/audio/<uuid>.mp3",
  "corrections": [
    {
      "id": "...",
      "original_phrase": "...",
      "corrected_phrase": "...",
      "explanation": "...",
      "error_level": "A2",
      "category": "grammar",
      "timestamp": "..."
    }
  ]
}
```

Errors:
- 400 if both `text` and `audio` are missing or both present.
- 422 if `audio` MIME type is unsupported.
- 502 if LLM upstream fails after retries.

### `GET /api/corrections?session_id=...`

Returns the full corrections history for the session. Pagination:
`?limit=20&offset=0`.

### `POST /api/level`

Body: `{"level": "A1"|"A2"|"B1"|"B2"|"C1"|"C2"}`. Persists in session state.

### `POST /api/conversation/reset`

Clears conversation history and corrections for the session.

### `GET /api/conversation/summary`

Returns a 1-paragraph summary of the conversation (LLM-generated).

---

## 5. LLM prompt design (system message skeleton)

```
You are COACH, a friendly English teacher chatting with a student on WhatsApp.

Student level: {LEVEL} (CEFR).
Tone: encouraging, natural, like a native speaker texting.

Rules:
- Reply in English. Keep it short (1-3 sentences).
- Continue the conversation naturally.
- Detect errors in the student's last message.
- For each error, output:
  - original_phrase, corrected_phrase, explanation, error_level (CEFR), category.
- Only return errors that you are confident about. If no errors, return [].
- error_level rubric:
  - A1: present simple, basic vocabulary, articles (a/the)
  - A2: past simple, present perfect, common prepositions
  - B1: conditionals, modals, phrasal verbs, basic relative clauses
  - B2: passive voice, mixed conditionals, nuanced prepositions
  - C1: subjunctive, inversion, advanced vocabulary, idiomatic expressions
  - C2: stylistic nuances, register shifts, rare exceptions
- Always return strict JSON: {"reply": "...", "corrections": [...]}.
- No prose outside the JSON.
```

---

## 6. Tasks (DoD)

1. `feat/initial-scaffold` — Next.js + FastAPI + uv + Docker. Both run via `docker compose up`. Health check 200. → merges via PR.
2. `feat/backend-core` — Chat endpoint, LLM client, JSON schema validation, level filtering. Tests for filter function. → PR.
3. `feat/backend-audio` — STT + TTS, multipart handling, static audio serving. Tests. → PR.
4. `feat/frontend-chat` — Chat tab UI, message input (text + mic), audio playback. → PR.
5. `feat/frontend-corrections` — Live correction panel + corrections-history tab. → PR.
6. `feat/topbar-levels` — Level selector + theme toggle. → PR.
7. `feat/e2e-tests` — Playwright e2e covering text path, audio path, correction filtering. Screenshots on success. → PR.
8. `feat/render-deploy` — Dockerfile + render.yaml. Manual deploy verified by Daviid. → PR.

Each PR must:
- Be on its own branch.
- Pass `uv run pytest -v` (backend) and `npm test` (frontend).
- Include screenshots if UI changed.
- Be pushed with `git push origin <branch>`. NEVER to main.
- Reference an issue number (will create one per task).

---

## 7. Open questions for Daviid (blockers if not answered)

1. **LLM provider**: confirm `MINIMAX_API_KEY` is available, or which model?
   Default assumption: `MiniMax-M2.7-highspeed` via the same config as before.
2. **Render redeploy**: do we point the existing `ai-coach-pnf5` service at the new repo, or create a new service and swap DNS later?
3. **Database**: persistence is in-process for v2. Is that OK for the demo, or do you want SQLite from day 1?
4. **TTS voice**: any preference? Default `en-US-AriaNeural` (warm female).

---

## 8. Improvements from user review (2026-09-22)

The four items below were prioritized by Daviid after reviewing the live
demo. They were originally proposed in this conversation and are now part
of the spec. Implementation belongs to the developer team — tracked as a
single kanban task on a branch to be created from `main`.

### 8.1 Visible message counter + warning before limit

**Problem.** The `DEMO_MESSAGE_LIMIT` (configurable at deploy time) is
invisible until the user writes their `N+1`-th message. The UI just
silently locks the input and the user has to guess why.

**Required.**

- Always-visible counter: a small chip near the input that updates as
  the user sends messages, e.g. `3 / 5 messages used`.
- When `remaining ≤ 1`: the counter turns amber and shows the warning
  text ("This is your last message" — must be translated).
- When `remaining === 0`: same chip turns red and surfaces the existing
  "demo limit reached" copy.
- When `unlimited === true` (sentinel `DEMO_MESSAGE_LIMIT=-1`): counter
  is hidden entirely. Do not render "∞" or "Unlimited" if Daviid prefers
  a clean look (Daviid's preference: hide the chip).
- Counter values come from a new `demo_message_limit` /
  `messages_used` returned by `GET /api/config`.

### 8.2 Full UI i18n (English + Spanish)

**Problem.** Frontend currently has zero i18n setup (no `next-intl`, no
`messages/{en,es}.json` directory). Several strings are hardcoded
English in JSX (e.g. `aria-label="Message input"`,
`aria-label="Send message"`, button titles, empty-state copy). The
language switcher that Daviid asked about previously landed separately on
`feat/archify-ai_coach-docs`; that switcher uses a tiny inline mapping and
should be wired to the proper i18n layer as part of this task.

**Required.**

- Add `next-intl` (latest stable, MIT, no API key) and configure
  `i18n.ts` with `locales = ['en', 'es']`, `defaultLocale = 'en'`.
- Create `frontend/messages/en.json` and
  `frontend/messages/es.json`. They must be kept in sync — keys present
  in one must be present in the other, and values must be real
  translations (no machine-translation-visible-to-the-user; Spanish
  strings should read like natural Spanish, not literal English).
- The locale switcher must use the i18n locale, persist to a cookie,
  and reload on change.
- Every user-visible string in `frontend/app/**` and
  `frontend/components/**` must go through `useTranslations()`. No
  hardcoded English in JSX. Strings to cover include but are not
  limited to: header labels, topbar, button titles, empty-state copy,
  error messages, audio control labels, banner text. `aria-label`s
  must also use translation keys.
- A unit test (frontend) or a small shell script must fail CI if the
  two `messages/*.json` files diverge in keys.
- The `archify-ai_coach-docs` branch is unrelated; i18n changes land
  on the new branch for this task.

### 8.3 Streaming responses (Server-Sent Events)

**Problem.** Today `POST /api/chat` blocks until the full LLM response
is generated (often 5-15 seconds for an OMNIROUTE reply). The user's
last input is consumed and the UI is silent until the response appears.
Perceived latency is awful.

**Required.**

- Add `POST /api/chat/stream` that returns `text/event-stream` (SSE)
  and emits chunks of the `reply` field as they arrive from the LLM.
- The LLM client in `backend/app/llm.py` already has partial streaming
  support (SSE chunk parsing around line ~254). Reuse it instead of
  writing a parallel implementation.
- The existing non-streaming `POST /api/chat` stays as the fallback
  when the client does not opt in to streaming (browser / curl).
- Frontend (`frontend/app/page.tsx` and any chat component): when
  the user submits a turn, request the streaming endpoint and append
  chunks to the placeholder coach bubble as they arrive. Maintain the
  existing JSON `{reply, corrections}` final-response semantics:
  the last SSE chunk must carry the full corrections array so the
  panel still renders after the bubble completes.
- Show an in-bubble spinner / pulsing cursor while streaming so the
  user knows the response is in flight.
- When the stream ends, the bubble must transition from "streaming"
  to "complete" and the corrections panel must populate.
- Backwards compatible: `POST /api/chat` (non-streaming) must keep
  working for clients that have not been updated yet.

### 8.4 Spaced repetition queue from correction history

**Problem.** The app shows corrections turn-by-turn but does not
retain them for review. A student who makes the same mistake repeatedly
never gets drilled on it. Corrections already carry `error_level` and
`category`; everything needed for a minimal SRS-style review queue
already exists.

**Required.**

- Persist corrections server-side. The existing `corrections.py`
  already keeps an in-memory store keyed by `session_id`; extend it
  to also write per-user per-correction records to disk (SQLite at
  `./data/corrections.db` is fine — in-process persistence is
  acceptable for this task). The storage format must support:
  - list the user's most-recent N corrections (sorted by recency)
  - list the user's top-K most-frequent correction *categories* and
    *original_phrases* (for the dashboard / queue)
  - mark corrections as "reviewed" with a timestamp
- New endpoints:
  - `GET /api/corrections/recent?user_id=…&limit=N`
    → list of recent corrections (id, user_text snippet, original,
      corrected, category, error_level, created_at).
  - `GET /api/corrections/queue?user_id=…&limit=K`
    → top most-frequent categories / original phrases for the queue.
  - `POST /api/corrections/{correction_id}/review` → mark reviewed.
- New frontend page or panel: a `/corrections` route OR a top-bar
  button that opens a panel listing the queue. Each row shows
  `original_phrase → corrected_phrase (category, error_level)` and a
  "Mark as reviewed" button. Empty state must be handled cleanly.
- Since v2 has no auth yet, identify users by `device_id` from
  localStorage, accepted via header `X-User-Device-Id`. Document this
  in each endpoint docstring.
- Keep it minimal. No leaderboard, no analytics, no spaced-repetition
  algorithm — just "this user has these errors; let them mark them
  reviewed". SRS scheduling can come later.

### Out of scope for this task
- Real DB (PostgreSQL). SQLite file at `./data/corrections.db` is fine.
- Audio streaming of the coach reply (TTS). Only the *text* stream
  is in scope for 8.3.
- Authentication / users. The `X-User-Device-Id` header convention
  stands in for a real user.
- Changes to the existing `feat/archify-ai_coach-docs` branch
  (open documentation diagrams).

### Acceptance criteria (must all pass before merge)

1. **AC-1 Counter.** Visible chip in the UI; counts match backend
   (`GET /api/config` returns `demo_message_limit`,
   `messages_used`). Hidden when `unlimited`.
2. **AC-2 i18n.** Zero hardcoded English strings in
   `frontend/app/**` and `frontend/components/**` user-visible
   surfaces. `messages/en.json` and `messages/es.json` have identical
   key sets (test enforced). Toggling the locale flips every visible
   string and persists the choice.
3. **AC-3 Streaming.** `curl -N POST /api/chat/stream` returns
   incremental SSE events for `reply`. The frontend bubble fills
   word-by-word (verify visually in the browser). The non-streaming
   `/api/chat` endpoint still works for clients that opt out.
4. **AC-4 SRS.** Sent corrections accumulate server-side. After 3
   turns with corrections, `/api/corrections/recent?limit=3`
   returns those 3 records. The frontend `/corrections` (or panel)
   lists them and "mark reviewed" persists across restarts.
5. **AC-5 Tests.** `uv run pytest` (backend) and `npm test`
   (frontend) both green.
6. **AC-6 Build.** `docker compose up --build` runs cleanly;
   `/api/health` returns 200.

### Branch + commit rules
- New branch: `feat/ux-improvements-demo-feedback` from `main`.
- Commits: conventional prefix per area (`feat(chat): …`,
  `feat(i18n): …`, `feat(corrections): …`).
- Push to `origin feat/ux-improvements-demo-feedback`. NO PR (Daviid
  merges manually).
- NO push to `main`.
