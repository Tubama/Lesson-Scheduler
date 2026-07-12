"""Entra ID token acquisition for the Power Automate MCP server.

Supports two auth modes:

* ``client_credentials`` -- app-only service principal (headless).
* ``device_code``        -- interactive delegated login, useful as a fallback
  when app-only access to the Flow API is not granted in your tenant.

Tokens are cached in-process and refreshed a little before expiry.
"""

from __future__ import annotations

import sys
import threading
import time

import msal

from .config import Config


class TokenProvider:
    """Acquires and caches an access token for the Flow management API."""

    # Refresh this many seconds before the token actually expires.
    _EXPIRY_SKEW = 120

    def __init__(self, config: Config) -> None:
        self._config = config
        self._lock = threading.Lock()
        self._token: str | None = None
        self._expires_at: float = 0.0

        if config.auth_mode == "client_credentials":
            self._app: msal.ClientApplication = msal.ConfidentialClientApplication(
                client_id=config.client_id,
                client_credential=config.client_secret,
                authority=config.authority,
            )
        else:
            self._app = msal.PublicClientApplication(
                client_id=config.client_id,
                authority=config.authority,
            )

    def get_token(self) -> str:
        """Return a valid bearer token, refreshing if necessary."""
        with self._lock:
            now = time.time()
            if self._token and now < self._expires_at - self._EXPIRY_SKEW:
                return self._token

            result = self._acquire()
            if "access_token" not in result:
                error = result.get("error_description") or result.get("error") or result
                raise RuntimeError(f"Failed to acquire token: {error}")

            self._token = result["access_token"]
            # expires_in is seconds from now; default to 55 min if absent.
            self._expires_at = now + float(result.get("expires_in", 3300))
            return self._token

    def _acquire(self) -> dict:
        scopes = [self._config.scope]
        if self._config.auth_mode == "client_credentials":
            # For .default scopes, acquire_for_client handles caching internally.
            return self._app.acquire_token_for_client(scopes=scopes)

        # Device-code (delegated) flow. Try the token cache first.
        accounts = self._app.get_accounts()
        if accounts:
            silent = self._app.acquire_token_silent(scopes, account=accounts[0])
            if silent and "access_token" in silent:
                return silent

        flow = self._app.initiate_device_flow(scopes=scopes)
        if "user_code" not in flow:
            raise RuntimeError(f"Failed to start device flow: {flow}")
        # Device-flow prompts must reach a human -- print to stderr so it does
        # not corrupt the stdio MCP protocol stream on stdout.
        print(flow["message"], file=sys.stderr, flush=True)
        return self._app.acquire_token_by_device_flow(flow)
