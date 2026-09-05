"""Pytest conftest: ensures `app` package is importable when tests run from backend/."""
import sys
from pathlib import Path

# Add backend/ to sys.path so `from app.xxx import yyy` works
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root))
