"""Tests for the audio janitor."""
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from app.audio_janitor import _cleanup_once, AUDIO_EXTENSIONS


@pytest.fixture
def fake_audio_root(tmp_path: Path) -> Path:
    """Create a fake audio directory with .gitkeep + stale + fresh files."""
    root = tmp_path / "audio"
    root.mkdir()
    (root / ".gitkeep").touch()
    # Stale files (>1h old)
    for name in ("stale1.mp3", "stale2.wav", "stale3.webm"):
        p = root / name
        p.write_bytes(b"x" * 100)
        old_time = time.time() - 7200  # 2h ago
        import os
        os.utime(p, (old_time, old_time))
    # Fresh files
    for name in ("fresh1.mp3", "fresh2.wav"):
        p = root / name
        p.write_bytes(b"y" * 100)
    # Non-audio file that should be ignored
    other = root / "readme.txt"
    other.write_text("hello")
    return root


def test_deletes_stale_files(fake_audio_root: Path) -> None:
    with patch("app.audio_janitor.AUDIO_ROOTS", (fake_audio_root,)):
        deleted = _cleanup_once(3600)
    assert deleted == 3
    remaining = {p.name for p in fake_audio_root.iterdir()}
    assert "stale1.mp3" not in remaining
    assert "fresh1.mp3" in remaining
    assert "fresh2.wav" in remaining


def test_preserves_gitkeep(fake_audio_root: Path) -> None:
    with patch("app.audio_janitor.AUDIO_ROOTS", (fake_audio_root,)):
        _cleanup_once(3600)
    assert (fake_audio_root / ".gitkeep").exists()


def test_ignores_non_audio_files(fake_audio_root: Path) -> None:
    with patch("app.audio_janitor.AUDIO_ROOTS", (fake_audio_root,)):
        _cleanup_once(3600)
    assert (fake_audio_root / "readme.txt").exists()


def test_handles_missing_root(tmp_path: Path) -> None:
    missing = tmp_path / "does_not_exist"
    with patch("app.audio_janitor.AUDIO_ROOTS", (missing,)):
        # Should not raise
        deleted = _cleanup_once(3600)
    assert deleted == 0


def test_only_targets_known_extensions(fake_audio_root: Path) -> None:
    # Add a "stale" file with an unknown extension; must be kept
    other = fake_audio_root / "unknown.xyz"
    other.write_bytes(b"z")
    import os
    old = time.time() - 7200
    os.utime(other, (old, old))
    with patch("app.audio_janitor.AUDIO_ROOTS", (fake_audio_root,)):
        deleted = _cleanup_once(3600)
    assert deleted == 3  # only the 3 stale audio files
    assert other.exists()


def test_extensions_constant() -> None:
    assert AUDIO_EXTENSIONS == {".mp3", ".wav", ".webm"}
