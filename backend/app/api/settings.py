import os
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Union

from app.llm import PROVIDERS
from app.session import store

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsRequest(BaseModel):
    session_id: str
    provider: str
    model: str


class SettingsResponse(BaseModel):
    provider: str
    model: str


@router.get("", response_model=SettingsResponse)
def get_settings(session_id: str) -> SettingsResponse:
    """Return the stored {provider, model} for the given session."""
    settings = store.get_settings(session_id)
    return SettingsResponse(provider=settings["provider"], model=settings["model"])


@router.post("", response_model=SettingsResponse)
def post_settings(body: SettingsRequest) -> Union[SettingsResponse, JSONResponse]:
    """
    Store {provider, model} for a session.
    Returns 422 if the provider is unknown.
    When the provider's env_key is unset, falls back to mock and adds X-Fallback header.
    """
    if body.provider not in PROVIDERS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown provider: {body.provider}. Available: {list(PROVIDERS.keys())}",
        )

    env_key = PROVIDERS[body.provider]["env_key"]
    api_key = os.getenv(env_key, "")
    if not api_key:
        # Will fall back to mock at LLM call time; inform the client via header
        from fastapi.responses import JSONResponse
        settings = {"provider": body.provider, "model": body.model}
        store.set_settings(body.session_id, settings)
        return JSONResponse(
            content={"provider": body.provider, "model": body.model},
            headers={"X-Fallback": f"{env_key} not set"},
        )

    settings = {"provider": body.provider, "model": body.model}
    store.set_settings(body.session_id, settings)
    return SettingsResponse(provider=body.provider, model=body.model)
