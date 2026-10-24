"""Regression test for the duplicated /api/config endpoint.

`app/main.py` used to define an inline `@app.get("/api/config")` alongside the
`config_router` included from `app/api/config.py`. FastAPI resolves the first
registered route, so the inline version shadowed the router's and silently
dropped `messages_used` from the response — breaking the frontend demo counter
while everything still type-checked, built, and passed its own tests.

These tests pin the behaviour so the shadowing cannot come back.
"""

import warnings

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def test_config_returns_messages_used(client: TestClient) -> None:
    """The endpoint must expose messages_used — the frontend counter reads it."""
    response = client.get("/api/config", params={"session_id": "regression-session"})
    assert response.status_code == 200
    body = response.json()
    assert "messages_used" in body, (
        "messages_used missing: an inline /api/config endpoint in main.py is "
        "shadowing app/api/config.py's router"
    )
    assert body["messages_used"] == 0
    assert "demo_message_limit" in body
    assert "unlimited" in body


def test_config_requires_session_id(client: TestClient) -> None:
    """Without a session_id the router should reject, not fall back to the
    inline endpoint (which took no arguments and would have answered here)."""
    response = client.get("/api/config")
    assert response.status_code == 422


def test_no_duplicate_operation_id() -> None:
    """OpenAPI generation must not warn about a duplicated config operation."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        app.openapi()
    duplicates = [w for w in caught if "Duplicate Operation" in str(w.message)]
    assert not duplicates, f"duplicate operation IDs: {[str(w.message) for w in duplicates]}"