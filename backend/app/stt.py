from faster_whisper import WhisperModel


# Use base model, CPU. Downloads cached automatically.
_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        # base model ~140MB, CPU
        _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model


def transcribe(audio_bytes: bytes) -> str:
    """
    Transcribe audio bytes to text using faster-whisper (base model, CPU).

    Args:
        audio_bytes: Raw audio file content (wav, mp3, ogg, webm, mp4).

    Returns:
        The transcribed text (may be empty string).
    """
    import tempfile
    import os

    model = _get_model()

    # Write to a temp file — faster-whisper reads from path
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        temp_path = f.name

    try:
        segments, _ = model.transcribe(temp_path, language="en", beam_size=5)
        return "".join(segment.text for segment in segments).strip()
    finally:
        os.unlink(temp_path)
