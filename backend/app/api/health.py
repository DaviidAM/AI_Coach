import asyncio
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter

from app.llm import PROVIDERS, DEFAULT_SETTINGS

router = APIRouter()
STARTED_AT = time.time()


async def check_session_store() -> dict:
    t = time.time()
    try:
        from app.session import SessionStore
        from app.models import ChatResponse
        # Session store is in-memory; just verify import and instantiation work
        store = SessionStore()
        store.get_or_create("__healthcheck__")
        return {"ok": True, "latency_ms": int((time.time() - t) * 1000)}
    except Exception as e:
        return {"ok": False, "error": str(e)[:80]}


async def check_audio_writable() -> dict:
    audio_dir = Path(__file__).parent.parent / "static" / "audio"
    try:
        audio_dir.mkdir(parents=True, exist_ok=True)
        probe = audio_dir / ".healthprobe"
        probe.write_text("ok")
        probe.unlink()
        return {"ok": True, "path": str(audio_dir)}
    except Exception as e:
        return {"ok": False, "error": str(e)[:80]}


async def check_omniroute() -> dict:
    t = time.time()
    base_url = os.getenv("OMNIROUTE_BASE_URL", "http://localhost:8082/v1")
    api_key = os.getenv("OMNIROUTE_API_KEY", "")
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {api_key or 'no-key'}"},
            )
        return {"ok": r.status_code == 200, "latency_ms": int((time.time() - t) * 1000)}
    except Exception as e:
        return {"ok": False, "error": str(e)[:80]}


async def check_tts_import() -> dict:
    try:
        import edge_tts  # noqa
        return {"ok": True, "engine": "edge-tts"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:80]}


async def check_stt_import() -> dict:
    try:
        from faster_whisper import WhisperModel  # noqa
        return {"ok": True, "engine": "faster-whisper"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:80]}


@router.get("/health")
async def health():
    checks = await asyncio.gather(
        check_session_store(),
        check_audio_writable(),
        check_omniroute(),
        check_tts_import(),
        check_stt_import(),
        return_exceptions=True,
    )
    names = ["session_store", "audio_writable", "omniroute", "tts_import", "stt_import"]
    checks_dict = {
        n: (c if isinstance(c, dict) else {"ok": False, "error": str(c)[:80]})
        for n, c in zip(names, checks)
    }

    # No real database in this app (in-memory only) — always ok
    checks_dict["database"] = {"ok": True, "latency_ms": 0}

    # Aggregate status
    if not all(v.get("ok") for v in checks_dict.values()):
        status = "degraded"
    else:
        status = "ok"

    return {
        "status": status,
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": int(time.time() - STARTED_AT),
        "checks": checks_dict,
    }
