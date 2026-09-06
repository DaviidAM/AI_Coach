import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app


def _ok(latency_ms: int = 1, **extra):
    return {"ok": True, "latency_ms": latency_ms, **extra}


def _fail(error: str = "error", **extra):
    return {"ok": False, "error": error, **extra}


@pytest.mark.asyncio
async def test_health_all_ok():
    with (
        patch("app.api.health.check_session_store", new_callable=AsyncMock, return_value=_ok()) as m1,
        patch("app.api.health.check_audio_writable", new_callable=AsyncMock, return_value=_ok()) as m2,
        patch("app.api.health.check_omniroute", new_callable=AsyncMock, return_value=_ok()) as m3,
        patch("app.api.health.check_tts_import", new_callable=AsyncMock, return_value=_ok()) as m4,
        patch("app.api.health.check_stt_import", new_callable=AsyncMock, return_value=_ok()) as m5,
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["version"] == "1.0.0"
        assert "timestamp" in data
        assert "uptime_seconds" in data
        assert "checks" in data
        assert data["checks"]["database"]["ok"] is True
        assert data["checks"]["session_store"]["ok"] is True
        assert data["checks"]["audio_writable"]["ok"] is True
        assert data["checks"]["omniroute"]["ok"] is True
        assert data["checks"]["tts_import"]["ok"] is True
        assert data["checks"]["stt_import"]["ok"] is True


@pytest.mark.asyncio
async def test_health_degraded_omniroute_down():
    with (
        patch("app.api.health.check_session_store", new_callable=AsyncMock, return_value=_ok()) as m1,
        patch("app.api.health.check_audio_writable", new_callable=AsyncMock, return_value=_ok()) as m2,
        patch("app.api.health.check_omniroute", new_callable=AsyncMock, return_value=_fail("connection refused")) as m3,
        patch("app.api.health.check_tts_import", new_callable=AsyncMock, return_value=_ok()) as m4,
        patch("app.api.health.check_stt_import", new_callable=AsyncMock, return_value=_ok()) as m5,
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "degraded"
        assert data["checks"]["omniroute"]["ok"] is False
        assert data["checks"]["omniroute"]["error"] == "connection refused"
        assert data["checks"]["database"]["ok"] is True


@pytest.mark.asyncio
async def test_health_degraded_tts_down():
    with (
        patch("app.api.health.check_session_store", new_callable=AsyncMock, return_value=_ok()) as m1,
        patch("app.api.health.check_audio_writable", new_callable=AsyncMock, return_value=_ok()) as m2,
        patch("app.api.health.check_omniroute", new_callable=AsyncMock, return_value=_ok()) as m3,
        patch("app.api.health.check_tts_import", new_callable=AsyncMock, return_value=_fail("no module named edge_tts")) as m4,
        patch("app.api.health.check_stt_import", new_callable=AsyncMock, return_value=_ok()) as m5,
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "degraded"
        assert data["checks"]["tts_import"]["ok"] is False


@pytest.mark.asyncio
async def test_health_aggregates_correctly():
    """All ok → ok; omniroute fails → degraded; audio fails → degraded."""
    # Case: omniroute down + tts down → degraded (not down since db is ok)
    with (
        patch("app.api.health.check_session_store", new_callable=AsyncMock, return_value=_ok()) as m1,
        patch("app.api.health.check_audio_writable", new_callable=AsyncMock, return_value=_ok()) as m2,
        patch("app.api.health.check_omniroute", new_callable=AsyncMock, return_value=_fail("timeout")) as m3,
        patch("app.api.health.check_tts_import", new_callable=AsyncMock, return_value=_fail("import error")) as m4,
        patch("app.api.health.check_stt_import", new_callable=AsyncMock, return_value=_ok()) as m5,
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/health")
        data = response.json()
        assert data["status"] == "degraded"
        # db is always ok, session_store and audio_writable are ok
        assert data["checks"]["database"]["ok"] is True
        assert data["checks"]["session_store"]["ok"] is True
        assert data["checks"]["audio_writable"]["ok"] is True
        assert data["checks"]["omniroute"]["ok"] is False
        assert data["checks"]["tts_import"]["ok"] is False
        assert data["checks"]["stt_import"]["ok"] is True
