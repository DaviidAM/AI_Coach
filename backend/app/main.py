from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.api.level import router as level_router
from app.api.conversation import router as conversation_router
from app.api.corrections import router as corrections_router

app = FastAPI(title="AI Coach API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_path = "/static"
if os.path.exists(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")

app.include_router(health_router, prefix="/api", tags=["health"])
app.include_router(chat_router, tags=["chat"])
app.include_router(level_router, tags=["level"])
app.include_router(conversation_router, tags=["conversation"])
app.include_router(corrections_router, tags=["corrections"])
