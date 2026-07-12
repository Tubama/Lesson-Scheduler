"""Configuration for the Power Automate MCP server.

All settings are read from environment variables so the server can run
headless. See ``.env.example`` for the full list and guidance.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def _require(name: str) -> str:
    value = _env(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            "Copy .env.example to .env and fill it in."
        )
    return value


@dataclass(frozen=True)
class Config:
    """Resolved server configuration."""

    tenant_id: str
    client_id: str
    client_secret: str | None
    auth_mode: str
    scope: str
    api_base: str
    api_version: str
    default_environment: str | None
    request_timeout: float

    @classmethod
    def from_env(cls) -> "Config":
        auth_mode = (_env("POWER_AUTOMATE_AUTH_MODE", "client_credentials") or "").lower()
        if auth_mode not in ("client_credentials", "device_code"):
            raise RuntimeError(
                "POWER_AUTOMATE_AUTH_MODE must be 'client_credentials' or 'device_code', "
                f"got {auth_mode!r}."
            )

        client_secret = _env("POWER_AUTOMATE_CLIENT_SECRET")
        if auth_mode == "client_credentials" and not client_secret:
            raise RuntimeError(
                "POWER_AUTOMATE_CLIENT_SECRET is required when "
                "POWER_AUTOMATE_AUTH_MODE=client_credentials."
            )

        return cls(
            tenant_id=_require("POWER_AUTOMATE_TENANT_ID"),
            client_id=_require("POWER_AUTOMATE_CLIENT_ID"),
            client_secret=client_secret,
            auth_mode=auth_mode,
            # Default resource for the legacy Flow management API. The trailing
            # "/.default" is MSAL's app-scope convention. Some tenants require
            # the double-slash form "https://service.flow.microsoft.com//.default"
            # -- override here if you get an "invalid audience" error.
            scope=_env("POWER_AUTOMATE_SCOPE", "https://service.flow.microsoft.com/.default"),
            api_base=_env("POWER_AUTOMATE_API_BASE", "https://api.flow.microsoft.com").rstrip("/"),
            api_version=_env("POWER_AUTOMATE_API_VERSION", "2016-11-01"),
            default_environment=_env("POWER_AUTOMATE_DEFAULT_ENVIRONMENT"),
            request_timeout=float(_env("POWER_AUTOMATE_REQUEST_TIMEOUT", "30") or "30"),
        )

    @property
    def authority(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant_id}"
