# Configurable demo message limit (deployment-time env var)

## Goal

Replace the hardcoded demo message limit (currently `5` in the frontend, `10` in
the backend history-truncation) with a single deployment-time environment
variable so the same image can run as a limited demo (`5`) or as an unlimited
AACoach deployment (`-1`).

The user must NOT be able to override the limit from the web UI. The only
legitimate override path is the deployment configuration (`docker-compose.yml`
environment / `.env` / Coolify env vars).

## Current state (gap analysis)

| File | Line | Current value | Role |
|---|---|---|---|
| `frontend/app/page.tsx` | 20 | `const MESSAGES_LIMIT = 5` | Disables inputs / mic / send when `userMessageCount >= 5`. Shows "limit reached" copy. |
| `frontend/app/page.tsx` | 43 | `const atLimit = userMessageCount >= MESSAGES_LIMIT` | Drives disabled state + placeholders. |
| `frontend/app/page.tsx` | 243 | `messageLimit={MESSAGES_LIMIT}` passed to Topbar | Renders counter `X of Y demo messages used` + `⚠️ limit reached` flag. |
| `frontend/components/Topbar.tsx` | ~80 | Counter only renders when `messageLimit !== undefined` | Already supports "no limit" mode (counter hidden). |
| `backend/app/session.py` | 5 | `MAX_MESSAGES = 10` | Truncates LLM history window (NOT the demo cap; user-facing cap lives in frontend). |
| `docker-compose.yml` | 48-59 | backend `environment:` block — no message-limit var | Where the new env var must be declared. |

Important nuance: the **enforcement of "5 demo messages" lives in the frontend**
(the backend does not reject at limit; it would happily keep serving). For
the configurable limit to be honored by *both* sides, the backend must also
expose it and (for the unlimited case at minimum) communicate `limit` /
`unlimited` to the frontend so the disabled-input state matches the deployment
intent.

## Functional requirements

### FR-1. Single source of truth: `DEMO_MESSAGE_LIMIT` env var

- **Backend** reads `DEMO_MESSAGE_LIMIT` at module import time (consistent
  with how `OMNIROUTE_DEFAULT_MODEL` is read in `app/llm.py`).
- **Sentinel values:**
  - `"5"` (or any positive integer string) → cap user messages at that number.
  - `"-1"` → unlimited. The demo mode is **disabled**.
  - unset / empty / non-integer / negative other than `-1` → fall back to
    default `5` and log a warning at startup.
- **Default behavior (env unset):** identical to today's hardcoded `5`.
  Zero-config deployments must keep working.

### FR-2. Backend enforcement

- `SessionStore.append_message(...)` must check `user_message_count` against
  the configured limit **before** appending a new user message. When at
  limit, raise / return a structured error that `POST /api/chat` translates
  to **HTTP 429** with `detail: "Demo message limit reached"`.
- The history-truncation `MAX_MESSAGES` (currently `10`) is a separate
  concern (LLM context window) and **stays as-is** — do NOT conflate it with
  the user-facing demo cap.
- A new endpoint (or extend `/api/health`) returns the effective config so
  ops can verify it post-deploy:
  - `GET /api/config` → `{"demo_message_limit": 5, "unlimited": false}`
  - When `unlimited: true`, `demo_message_limit: null`.

### FR-3. Frontend: read limit from backend at boot, no rebuild required

- On mount, frontend calls `GET /api/config` and stores `demoMessageLimit`.
- When limit is `null` (unlimited):
  - `atLimit` is **never** true.
  - `MESSAGES_LIMIT` constant is replaced with `null` semantics.
  - Counter in Topbar is hidden (already supported by `messageLimit === undefined`).
  - Placeholder "Demo version message limit reached" never shows.
- When limit is a positive number:
  - Behaves exactly like today (`atLimit = userMessageCount >= limit`).
- If `GET /api/config` fails, fall back to `5` and log a console warning.
  (Do NOT block the UI on this.)
- The `MESSAGES_LIMIT = 5` hardcoded constant is **removed**.

### FR-4. Deployment-time only

- No UI surface, no localStorage knob, no query-string param, no
  per-session override. The user CANNOT modify the limit from the web.
- The env var is read server-side at backend startup. Changing it requires
  a redeploy (`docker compose up -d --build`).

### FR-5. Docker / deployment wiring

- `docker-compose.yml` adds a `DEMO_MESSAGE_LIMIT` env var to the backend
  service, default `5`. Documented inline next to the other `OMNIROUTE_*`
  vars.
- `Dockerfile.backend` needs NO changes (env vars come from compose / Coolify).
- README.md gets a one-paragraph update under "Configuration > Backend":
  - Name of the var
  - Sentinel `-1` meaning
  - Example: `DEMO_MESSAGE_LIMIT=-1 docker compose up -d --build`

## Acceptance criteria (each one is verifiable)

1. **AC-1 default behavior unchanged.** With no env var set, sending 5 user
   messages in a session blocks the 6th (frontend disables inputs, /api/chat
   returns 429 with `Demo message limit reached`). Reset still works.
2. **AC-2 unlimited via env.** Setting `DEMO_MESSAGE_LIMIT=-1` on the backend
   and restarting: the frontend never disables the input, never shows the
   "limit reached" copy, never renders the counter in the Topbar, and the
   user can send ≥ 20 messages in a single session without any 429.
3. **AC-3 custom limit via env.** Setting `DEMO_MESSAGE_LIMIT=20` on the
   backend and restarting: the user can send exactly 20 messages; the 21st
   is rejected by the backend with HTTP 429.
4. **AC-4 invalid value fallback.** Setting `DEMO_MESSAGE_LIMIT=abc` (or
   `DEMO_MESSAGE_LIMIT=-5`) logs a warning at backend startup and the
   effective limit falls back to `5`.
5. **AC-5 /api/config surfaces the value.** `GET /api/config` returns
   `{demo_message_limit: 5, unlimited: false}` when the env is `5`, and
   `{demo_message_limit: null, unlimited: true}` when the env is `-1`.
6. **AC-6 no UI override path.** Searching the diff for `localStorage`,
   `querySelector`, `URLSearchParams`, `window.location` shows no new code
   path that lets a user set the limit. The only knobs are the env var and
   the backend restart.
7. **AC-7 tests added.** A new test file
   `backend/tests/test_message_limit.py` covers: default 5, custom positive
   int, `-1` unlimited, invalid fallback, `/api/config` response shape, and
   `POST /api/chat` 429 at limit. Pattern follows existing
   `test_env_overrides.py`.
8. **AC-8 docker-compose env var present.** `docker-compose.yml` backend
   service declares `DEMO_MESSAGE_LIMIT=${DEMO_MESSAGE_LIMIT:-5}` in the
   `environment:` block.
9. **AC-9 README updated.** A new paragraph under "Configuration > Backend"
   documents `DEMO_MESSAGE_LIMIT`, the `-1` sentinel, and the redeploy
   requirement.
10. **AC-10 history truncation untouched.** `backend/app/session.py`
    `MAX_MESSAGES` (LLM context window) is unchanged. Tests still pass for
    history truncation behavior.

## Out of scope (explicit non-goals)

- Per-user or per-session limits (no auth layer yet; out of scope).
- Hiding the "Demo Version" badge in the Topbar when unlimited. The badge
  can stay — it's a UI marker, not a behavior gate. (Easy to flip later if
  Daviid wants it.)
- Admin UI to change the limit at runtime. Env var + redeploy is the
  explicit contract.
- Persisting the limit across sessions — limit is process-global, session
  storage is per-session as today.

## Files expected to change

- `backend/app/session.py` — replace `MAX_MESSAGES` user-cap constant; add
  `DEMO_MESSAGE_LIMIT` parsing + helpers.
- `backend/app/main.py` — add `GET /api/config` endpoint.
- `backend/app/api/chat.py` — enforce limit before `append_message`, return
  HTTP 429.
- `backend/tests/test_message_limit.py` — new test file.
- `frontend/app/page.tsx` — drop `MESSAGES_LIMIT = 5`, fetch from `/api/config`
  on mount, propagate `null` vs number to `atLimit` and Topbar.
- `frontend/components/Topbar.tsx` — already supports `undefined`; verify
  behavior with `null`.
- `docker-compose.yml` — add `DEMO_MESSAGE_LIMIT` env.
- `README.md` — one-paragraph config doc.

## Branch + PR contract (per War Room rules)

- Branch: `feat/configurable-message-limit` (already created).
- Commits: small, conventional-commit prefixed (`feat(backend): ...`,
  `feat(frontend): ...`, `test: ...`, `docs: ...`).
- Push to `origin feat/configurable-message-limit` at the end.
- Do **NOT** open the PR — Daviid merges manually.
- Do **NOT** push to `main`.

## Definition of done

- [ ] All 10 ACs verifiable with real commands / curl / pytest output.
- [ ] `pytest backend/tests` passes locally.
- [ ] `npm run build` (or equivalent) passes for the frontend.
- [ ] One run with `DEMO_MESSAGE_LIMIT=5`, one with `DEMO_MESSAGE_LIMIT=-1`,
      and one with the var unset — all three scenarios documented in the
      final completion comment with curl/console evidence.
- [ ] `git log origin/feat/configurable-message-limit --oneline` shows the
      commits. No uncommitted work left behind.
