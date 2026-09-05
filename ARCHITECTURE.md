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
