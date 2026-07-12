"""MCP server exposing Power Automate (Flow) management tools.

Run with:  python -m power_automate_mcp
Transport: stdio (the standard MCP transport for local servers).
"""

from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

from mcp.server.fastmcp import FastMCP

from .auth import TokenProvider
from .client import FlowApiError, FlowClient
from .config import Config

mcp = FastMCP("power-automate")

# Lazily initialised so `--help`/import never require credentials.
_client: FlowClient | None = None


def _get_client() -> FlowClient:
    global _client
    if _client is None:
        config = Config.from_env()
        _client = FlowClient(config, TokenProvider(config))
    return _client


def _format(result: Any) -> str:
    """Render an API result as pretty JSON for the model to read."""
    if result is None:
        return "OK (no content returned)."
    return json.dumps(result, indent=2, ensure_ascii=False)


async def _call(action: Callable[[FlowClient], Awaitable[Any]]) -> str:
    """Acquire the client and run ``action`` inside one error boundary.

    The client is built here (not by the caller) so missing-credential errors
    surface as a clean message instead of crashing the tool call.
    """
    try:
        client = _get_client()
        return _format(await action(client))
    except FlowApiError as exc:
        return f"Error: {exc}\n{_format(exc.body)}"
    except (ValueError, RuntimeError) as exc:
        return f"Error: {exc}"


@mcp.tool()
async def list_environments() -> str:
    """List the Power Platform environments the service principal can access.

    Use the returned environment ``name`` (a GUID-like id) as the
    ``environment`` argument to the other tools.
    """
    return await _call(lambda c: c.list_environments())


@mcp.tool()
async def list_flows(environment: str | None = None, top: int | None = None) -> str:
    """List cloud flows in an environment.

    Args:
        environment: Environment name/id. Defaults to
            POWER_AUTOMATE_DEFAULT_ENVIRONMENT if unset.
        top: Optional maximum number of flows to return.
    """
    return await _call(lambda c: c.list_flows(environment=environment, top=top))


@mcp.tool()
async def get_flow(flow_name: str, environment: str | None = None) -> str:
    """Get the full definition and status of a single flow by its name/id."""
    return await _call(lambda c: c.get_flow(flow_name, environment=environment))


@mcp.tool()
async def enable_flow(flow_name: str, environment: str | None = None) -> str:
    """Turn a flow ON (start). The flow will begin responding to its triggers."""
    return await _call(lambda c: c.enable_flow(flow_name, environment=environment))


@mcp.tool()
async def disable_flow(flow_name: str, environment: str | None = None) -> str:
    """Turn a flow OFF (stop). The flow will stop responding to its triggers."""
    return await _call(lambda c: c.disable_flow(flow_name, environment=environment))


@mcp.tool()
async def delete_flow(flow_name: str, environment: str | None = None) -> str:
    """Permanently delete a flow. This cannot be undone -- confirm before use."""
    return await _call(lambda c: c.delete_flow(flow_name, environment=environment))


@mcp.tool()
async def list_runs(
    flow_name: str, environment: str | None = None, top: int | None = None
) -> str:
    """List recent run history for a flow (most recent first)."""
    return await _call(
        lambda c: c.list_runs(flow_name, environment=environment, top=top)
    )


@mcp.tool()
async def get_run(flow_name: str, run_name: str, environment: str | None = None) -> str:
    """Get details (status, timings, error) for a single flow run."""
    return await _call(
        lambda c: c.get_run(flow_name, run_name, environment=environment)
    )


@mcp.tool()
async def run_flow(
    flow_name: str,
    trigger_name: str,
    environment: str | None = None,
    payload: dict[str, Any] | None = None,
) -> str:
    """Manually trigger a flow run.

    Args:
        flow_name: The flow's name/id.
        trigger_name: The trigger to invoke (e.g. "manual"). See get_flow to
            find the flow's trigger names.
        environment: Environment name/id (optional if a default is set).
        payload: Optional JSON body passed to the trigger.
    """
    return await _call(
        lambda c: c.run_flow(
            flow_name, trigger_name, environment=environment, payload=payload
        )
    )


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
