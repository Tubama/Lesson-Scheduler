"""Thin async HTTP client for the Power Automate (Flow) management API.

Wraps the ``Microsoft.ProcessSimple`` provider endpoints under
``https://api.flow.microsoft.com``. Every method returns parsed JSON (or
``None`` for empty 2xx responses) and raises :class:`FlowApiError` on failure.
"""

from __future__ import annotations

from typing import Any

import httpx

from .auth import TokenProvider
from .config import Config


class FlowApiError(RuntimeError):
    """Raised when the Flow API returns a non-2xx response."""

    def __init__(self, status_code: int, message: str, body: Any = None) -> None:
        super().__init__(f"Flow API {status_code}: {message}")
        self.status_code = status_code
        self.body = body


class FlowClient:
    def __init__(self, config: Config, tokens: TokenProvider) -> None:
        self._config = config
        self._tokens = tokens
        self._provider = "/providers/Microsoft.ProcessSimple"

    # -- internals ---------------------------------------------------------

    def _resolve_environment(self, environment: str | None) -> str:
        env = environment or self._config.default_environment
        if not env:
            raise ValueError(
                "No environment specified and POWER_AUTOMATE_DEFAULT_ENVIRONMENT is unset. "
                "Call list_environments to find the environment name."
            )
        return env

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any = None,
    ) -> Any:
        url = f"{self._config.api_base}{path}"
        query = {"api-version": self._config.api_version}
        if params:
            query.update({k: v for k, v in params.items() if v is not None})

        headers = {
            "Authorization": f"Bearer {self._tokens.get_token()}",
            "Accept": "application/json",
        }
        if json_body is not None:
            headers["Content-Type"] = "application/json"

        async with httpx.AsyncClient(timeout=self._config.request_timeout) as http:
            response = await http.request(
                method, url, params=query, headers=headers, json=json_body
            )

        if response.status_code >= 400:
            body: Any
            try:
                body = response.json()
                message = (
                    body.get("error", {}).get("message")
                    if isinstance(body, dict)
                    else response.text
                ) or response.text
            except ValueError:
                body = response.text
                message = response.text
            raise FlowApiError(response.status_code, message, body)

        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return response.text

    # -- environments ------------------------------------------------------

    async def list_environments(self) -> Any:
        return await self._request("GET", f"{self._provider}/environments")

    # -- flows -------------------------------------------------------------

    def _flows_path(self, environment: str | None) -> str:
        env = self._resolve_environment(environment)
        return f"{self._provider}/environments/{env}/flows"

    async def list_flows(self, environment: str | None = None, top: int | None = None) -> Any:
        params = {"$top": top} if top else None
        return await self._request("GET", self._flows_path(environment), params=params)

    async def get_flow(self, flow_name: str, environment: str | None = None) -> Any:
        return await self._request(
            "GET", f"{self._flows_path(environment)}/{flow_name}"
        )

    async def enable_flow(self, flow_name: str, environment: str | None = None) -> Any:
        return await self._request(
            "POST", f"{self._flows_path(environment)}/{flow_name}/start"
        )

    async def disable_flow(self, flow_name: str, environment: str | None = None) -> Any:
        return await self._request(
            "POST", f"{self._flows_path(environment)}/{flow_name}/stop"
        )

    async def delete_flow(self, flow_name: str, environment: str | None = None) -> Any:
        return await self._request(
            "DELETE", f"{self._flows_path(environment)}/{flow_name}"
        )

    # -- runs --------------------------------------------------------------

    async def list_runs(
        self, flow_name: str, environment: str | None = None, top: int | None = None
    ) -> Any:
        params = {"$top": top} if top else None
        return await self._request(
            "GET", f"{self._flows_path(environment)}/{flow_name}/runs", params=params
        )

    async def get_run(
        self, flow_name: str, run_name: str, environment: str | None = None
    ) -> Any:
        return await self._request(
            "GET", f"{self._flows_path(environment)}/{flow_name}/runs/{run_name}"
        )

    async def run_flow(
        self,
        flow_name: str,
        trigger_name: str,
        environment: str | None = None,
        payload: Any = None,
    ) -> Any:
        return await self._request(
            "POST",
            f"{self._flows_path(environment)}/{flow_name}/triggers/{trigger_name}/run",
            json_body=payload,
        )
