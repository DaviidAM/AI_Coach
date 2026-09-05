from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from pathlib import Path

from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.api.level import router as level_router
from app.api.conversation import router as conversation_router
from app.api.corrections import router as corrections_router
from app.api.settings import router as settings_router

app = FastAPI(title="AI Coach API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve static dir relative to this file, not the CWD.
# chat.py saves coach/user audio to app/static/audio/ — mount that.
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
(STATIC_DIR / "audio").mkdir(parents=True, exist_ok=True)
(STATIC_DIR / "audio" / "stt").mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(health_router, prefix="/api", tags=["health"])
app.include_router(chat_router, tags=["chat"])
app.include_router(level_router, tags=["level"])
app.include_router(conversation_router, tags=["conversation"])
app.include_router(corrections_router, tags=["corrections"])
app.include_router(settings_router, tags=["settings"])
