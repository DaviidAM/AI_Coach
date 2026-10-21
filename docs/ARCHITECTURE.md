# AI Coach — Architecture

## System Overview

AI Coach is a voice conversation coach that runs entirely in the browser. The user speaks, the browser records and sends audio to the backend, a Whisper STT model transcribes it, an LLM generates a coach reply, an Edge TTS model synthesises the reply as audio, and the browser plays it back — all with no page reloads.

```
┌──────────┐     HTTPS      ┌───────────┐     /api/*      ┌──────────────┐
│  Browser │ ──────────────►│  Next.js  │ ──────────────►│   FastAPI    │
│  (mic +   │◄──────────────│  :3000    │◄───────────────│   :8091      │
│  <audio>) │  /static/audio │  (proxy)  │    rewrites    │              │
└──────────┘                └───────────┘                └──────┬───────┘
                                                                 │
                         ┌──────────────┐     ┌─────────────────┴────────┐
                         │ faster-whisper│     │        LLM (OmniRoute)  │
                         │ STT (CPU)    │     │  get_llm_reply()         │
                         └──────────────┘     └─────────────────────────┘
                                                              │
                         ┌──────────────┐     ┌─────────────────────────┐
                         │  Edge TTS    │◄────│  coach reply text        │
                         │ (ARIA Neural)│     └─────────────────────────┘
                         └──────┬───────┘
                                │ coach .mp3
                    ┌───────────┴──────────┐
                    │  Docker volumes       │
                    │  ai-coach-audio       │
                    │  (coach .mp3 files)  │
                    └───────────────────────┘
```

## Component Reference

### Frontend — Next.js (`:3000` inside container, `:18101` externally)

Single-page app at `frontend/app/page.tsx`. Key behaviour:

- **Recording** — `MediaRecorder` captures microphone input as `audio/webm` chunks; accumulated blobs are sent via `fetch('/api/chat', { method: 'POST', body: formData })`.
- **Message limit** — `MESSAGES_LIMIT = 5`; when reached the record button is disabled and a reset button is shown.
- **Playback** — `<audio src={coachAudioUrl} autoplay />` where `coachAudioUrl` points to `/static/audio/<session_id>.mp3`.
- **API proxy** — Next.js rewrites `/api/*` → `http://backend:8091/*` so the browser only talks to one origin.

### Backend — FastAPI (`:8091`)

`backend/app/main.py` exposes two routes relevant to the conversation loop:

| Route | Method | Description |
|-------|--------|-------------|
| `/api/chat` | POST | Receives `audio/webm`, saves to `stt/` dir, transcribes, queries LLM, synthesises TTS, returns `{ sessionId, audioUrl }` |
| `/static/audio/<path:path>` | GET | Serves files from `backend/app/static/audio/` |

Internal modules:

- **`session.py`** — `SessionStore` dict keyed by session ID; holds `history[]`, `audio_path`, `messages_count`. In-memory only; lost on restart.
- **`stt.py`** — `transcribe(audio_path) → str` using `faster-whisper` (base model, CPU, int8).
- **`llm.py`** — `get_llm_reply(history) → str` using Azure OpenAI via OmniRoute (host.docker.internal:20128).
- **`tts.py`** — `synthesize(text, output_path) → None` using `edge-tts` (en-US-AriaNeural).
- **`chat.py`** — assembles the full pipeline: save → transcribe → LLM → TTS → update session.

### Audio files

| Path | Volume | Lifecycle |
|------|--------|-----------|
| `static/audio/<session_id>.mp3` | `ai-coach-audio` | Persistent — survives restart |
| `static/audio/stt/<uuid>.webm` | `ai-coach-audio-stt` | Ephemeral — cleaned by janitor |

## Diagrams

| Diagram | File |
|---------|------|
| Component architecture | `docs/diagrams/ai-coach-architecture.html` |
| Chat sequence | `docs/diagrams/ai-coach-chat-sequence.html` |
| Audio dataflow | `docs/diagrams/ai-coach-audio-dataflow.html` |
| Dev deploy topology | `docs/diagrams/ai-coach-dev-deploy.html` |

## Environment

```
NEXT_PUBLIC_API_URL=           # Not used — Next.js rewrites /api/* internally
OLLAMA_BASE_URL=ollama:11434  # Resolved inside Docker network (unused — OmniRoute used instead)
AZURE_OPENAI_API_KEY=          # Passed to OmniRoute container
OMNIROUTE_URL=host.docker.internal:20128
```

## Key Design Decisions

- **OmniRoute over direct Ollama** — OmniRoute is a local LLM router running as a systemd service on the host; the backend calls it via `host.docker.internal`. This keeps the LLM off the Docker network and avoids credential management inside containers.
- **Edge TTS over local TTS** — Cloud synthesis ensures consistent quality and avoids model download on first use. Works offline for English voices.
- **Session in-memory** — No Redis or database; `SessionStore` is a plain dict. Suitable for single-instance deployments.
- **No WebSocket** — Chat uses plain HTTP/1.1 POST; the browser polls or re-requests after each exchange.
