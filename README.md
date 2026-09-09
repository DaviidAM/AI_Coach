# English AI Coach — Demo Version

> Browser-based English tutor that listens, transcribes, corrects, and
> speaks back. Built as a Next.js + FastAPI showcase of a free-model
> LLM routed through OmniRoute (a self-hosted multi-provider gateway).

![AI Coach — conversation with a correction highlighted](docs/screenshots/chat-hero.png)

A student practices English and the COACH detects, explains and corrects
errors in real time. In the screenshot above, the user wrote
*"I have many homework to do"*; the COACH replies and the live corrections
panel flags `many homework → a lot of homework` (A1, uncountable noun).

## Features

- Conversational chat (English only) with WhatsApp-style audio bubbles
- Hold-to-record audio input (browser MediaRecorder)
- Free-text input with Enter-to-send
- Choose CEFR level (A1 beginner → C2 proficient) from a topbar dropdown
- Live TTS replies (en-US-AriaNeural via edge-tts)
- Live corrections panel with severity (critical/minor) and category
  badges (grammar / vocabulary / style / word_order)
- "All Corrections" modal: see the entire conversation error history
- Demo Version badge to flag the prototype status
- Connected to free LLM models via the OmniRoute gateway — no API key
  required, no usage caps.

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, CSS Modules
- **Backend**: FastAPI 0.110, uvicorn, Pydantic v2
- **ASR**: faster-whisper (local CPU inference)
- **TTS**: edge-tts (no API key, en-US-AriaNeural)
- **LLM**: routed by OmniRoute → free model via OpenAI-compatible API
- **Tests**: pytest (backend), Jest (frontend), Playwright (e2e)

## Quickstart

### Prerequisites

- Python 3.11+
- Node 20+
- A running OmniRoute instance (or any OpenAI-compatible endpoint)
  configured via the `OMNIROUTE_BASE_URL` environment variable.

### Backend

```bash
cd backend
uv sync
OMNIROUTE_BASE_URL=https://your-gateway.example.com/v1 \
  uv run uvicorn app.main:app --host 0.0.0.0 --port 8091
```

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8091 \
  npm run dev
```

Visit http://localhost:3000.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design.

## Configuration

Both sides read environment variables. No file-based config.

### Backend

LLM provider is `omniroute` by default. AI Coach talks to any
OpenAI-compatible chat-completions endpoint through OmniRoute's gateway.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OMNIROUTE_BASE_URL` | yes | `http://localhost:8082/v1` | OpenAI-compatible `/chat/completions` endpoint. |
| `OMNIROUTE_API_KEY` | no | _(empty)_ | Bearer token sent in `Authorization` header. Most self-hosted gateways don't require one; leave unset if your gateway accepts anonymous requests. |
| `OMNIROUTE_DEFAULT_MODEL` | no | `auto/best-chat` | Combo or model name used for new sessions. Accepts any value that resolves on the gateway: OmniRoute predefined combos (`auto/best-coding`, `auto/cheap`, `auto/pro-coding`, …), provider/model strings (`minimax/MiniMax-M2.7-highspeed`, `nvidia/meta/llama-3.3-70b-instruct`, `openrouter/anthropic/claude-3.5-sonnet`, …), or your own custom combos (e.g. `primary-chain`). |
| `OMNIROUTE_DEFAULT_COMBO_FALLBACK` | no | `primary-chain` | Used automatically when the first request returns 401/404 (e.g. a custom combo that doesn't exist on the gateway, or a model the active provider rejected). The client retries once with this model before surfacing the error to the user. |

#### Choosing a model / combo at runtime

The user can switch the active model via `POST /settings`:

```bash
curl -X POST http://localhost:8091/settings \
  -H "Content-Type: application/json" \
  -d '{"provider": "omniroute", "model": "auto/best-coding"}'
```

The new model is persisted in the in-memory session and used for every
subsequent chat turn. The fallback chain (`OMNIROUTE_DEFAULT_COMBO_FALLBACK`)
still kicks in if the chosen model 401s/404s.

#### How the fallback works

```
client call_llm(model="custom-combo")
   │
   ▼
POST {OMNIROUTE_BASE_URL}/chat/completions  body={model: "custom-combo"}
   │
   ▼
response status
   │
   ├── 200 ──────────────────────────────────► return content
   │
   ├── 401 or 404 + provider == "omniroute"
   │      │
   │      ▼
   │      POST again with body={model: OMNIROUTE_DEFAULT_COMBO_FALLBACK}
   │      │
   │      ├── 200 ────────────────────────────► return content (silent fallback)
   │      │
   │      └── anything else ─────────────────► raise LLMError to caller
   │
   └── any other status ─────────────────────► raise LLMError to caller
```

Note: 400 with `"Unable to determine provider"` is **not** covered by the
fallback — that means the model string is malformed (e.g. `demo-combo`
when no combo with that name exists on the gateway AND it doesn't match
any `provider/name` prefix). Fix the model name in that case.

### Frontend

- `NEXT_PUBLIC_API_URL` — base URL the browser hits for the backend
  (default: `http://localhost:8000`).

## Limitations

- Demo Version: single session in memory, no persistence between restarts.
- Free-model responses vary in quality. Set CEFR level carefully to
  filter corrections.
- The All Corrections modal reflects the current in-memory session
  only — closing the tab clears it.

## License

MIT.
