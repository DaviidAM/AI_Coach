"""Periodic janitor for ephemeral audio files.

Deletes TTS outputs (.mp3) and STT inputs (.wav/.webm) older than
AUDIO_MAX_AGE_SECONDS (default 1h). Runs every AUDIO_CLEANUP_INTERVAL_SECONDS
(default 1h) in a background asyncio task started by the FastAPI lifespan.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path

logger = logging.getLogger(__name__)

AUDIO_ROOTS = (
    Path(__file__).parent / "static" / "audio",
    Path(__file__).parent.parent / "static" / "audio",
)
AUDIO_EXTENSIONS = {".mp3", ".wav", ".webm"}


def _cleanup_once(max_age_seconds: int) -> int:
    """Delete audio files older than max_age_seconds. Returns count deleted."""
    cutoff = time.time() - max_age_seconds
    deleted = 0
    for root in AUDIO_ROOTS:
        if not root.exists():
            continue
        for f in root.rglob("*"):
            if not f.is_file():
                continue
            if f.suffix.lower() not in AUDIO_EXTENSIONS:
                continue
            try:
                mtime = f.stat().st_mtime
            except OSError:
                continue
            if mtime < cutoff:
                try:
                    f.unlink()
                    deleted += 1
                except OSError as e:
                    logger.warning("audio_janitor: failed to delete %s: %s", f, e)
    return deleted


async def run_janitor(stop_event: asyncio.Event) -> None:
    """Run the cleanup loop until stop_event is set."""
    interval = int(os.getenv("AUDIO_CLEANUP_INTERVAL_SECONDS", "3600"))
    max_age = int(os.getenv("AUDIO_MAX_AGE_SECONDS", "3600"))
    logger.info(
        "audio_janitor: starting (interval=%ds, max_age=%ds)",
        interval, max_age,
    )
    # First sweep 30s after startup so we don't hammer disk on cold start
    await asyncio.sleep(30)
    while not stop_event.is_set():
        try:
            deleted = await asyncio.to_thread(_cleanup_once, max_age)
            if deleted:
                logger.info(
                    "audio_janitor: deleted %d stale files (max_age=%ds)",
                    deleted, max_age,
                )
        except Exception:
            logger.exception("audio_janitor: sweep failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
