import asyncio
from pathlib import Path

import edge_tts


DEFAULT_VOICE = "en-US-AriaNeural"


async def _synthesize_impl(text: str, output_path: Path, voice: str) -> None:
    """Async implementation using edge-tts."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_path))


async def synthesize(text: str, output_path: Path, voice: str = DEFAULT_VOICE) -> None:
    """
    Synthesize text to audio using Microsoft Edge TTS (edge-tts).

    Args:
        text: Text to synthesize.
        output_path: Destination .mp3 file path.
        voice: Edge TTS voice name. Defaults to en-US-AriaNeural.
    """
    await _synthesize_impl(text, output_path, voice)
