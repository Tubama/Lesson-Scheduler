# Power Automate MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an
MCP client (Claude Code, Claude Desktop, etc.) manage **Microsoft Power Automate
cloud flows** — list, inspect, enable/disable, delete, view run history, and
trigger runs — through the Flow management API.

> This is a self-contained subproject of Lesson-Scheduler. It has its own Python
> dependencies and does not touch the Next.js app.

## Tools

| Tool | What it does |
|------|--------------|
| `list_environments` | List Power Platform environments the identity can access |
| `list_flows` | List cloud flows in an environment |
| `get_flow` | Get a flow's full definition and status |
| `enable_flow` | Turn a flow **on** |
| `disable_flow` | Turn a flow **off** |
| `delete_flow` | Permanently delete a flow |
| `list_runs` | List a flow's recent run history |
| `get_run` | Get details for a single run |
| `run_flow` | Manually trigger a flow run (optional JSON payload) |

## Prerequisites

1. **An Entra ID (Azure AD) app registration** in the tenant that owns your
   Power Platform environment.
2. A **client secret** on that app (for the default app-only auth mode).
3. API permission to the Flow management API. In the Azure portal add a
   permission for **Microsoft Flow Service** / `service.flow.microsoft.com`, and
   grant admin consent.

> **Heads-up on app-only access.** Microsoft's Flow management API historically
> favored *delegated* access. If app-only (client-credentials) calls return
> `401`/`403` in your tenant, switch to the interactive fallback by setting
> `POWER_AUTOMATE_AUTH_MODE=device_code` (no client secret needed). You'll be
> prompted once to sign in; the token is then cached in-process.

## Setup

```bash
cd power-automate-mcp
python -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt     # or: pip install -e .

cp .env.example .env                 # then fill in tenant/client/secret
```

## Run

```bash
# From power-automate-mcp/, with .env exported into the environment:
set -a && source .env && set +a
python -m power_automate_mcp
```

The server speaks MCP over **stdio**, so you normally don't run it by hand —
your MCP client launches it. Running it directly is only useful to confirm it
imports and authenticates.

## Register with Claude Code

Add it to your MCP config (e.g. `.mcp.json` at the repo root, or your user
config). Point `PYTHONPATH` at the package's `src` directory, or install it with
`pip install -e .` first and drop the `PYTHONPATH`/`cwd` juggling.

```json
{
  "mcpServers": {
    "power-automate": {
      "command": "python",
      "args": ["-m", "power_automate_mcp"],
      "cwd": "power-automate-mcp",
      "env": {
        "PYTHONPATH": "src",
        "POWER_AUTOMATE_TENANT_ID": "<tenant-guid>",
        "POWER_AUTOMATE_CLIENT_ID": "<app-client-id>",
        "POWER_AUTOMATE_CLIENT_SECRET": "<client-secret>",
        "POWER_AUTOMATE_AUTH_MODE": "client_credentials"
      }
    }
  }
}
```

Prefer keeping secrets out of the JSON — reference a `.env` you load in your
shell, or use your client's secret handling.

## Configuration reference

See [`.env.example`](./.env.example). Key variables:

- `POWER_AUTOMATE_TENANT_ID`, `POWER_AUTOMATE_CLIENT_ID` — required.
- `POWER_AUTOMATE_CLIENT_SECRET` — required for `client_credentials`.
- `POWER_AUTOMATE_AUTH_MODE` — `client_credentials` (default) or `device_code`.
- `POWER_AUTOMATE_SCOPE` — override if you hit an "invalid audience" error.
- `POWER_AUTOMATE_DEFAULT_ENVIRONMENT` — so you can omit `environment` per call.

## Security notes

- The `.env` file and any secrets are git-ignored — never commit them.
- `delete_flow` is destructive and irreversible; confirm before invoking it.
- App registrations should be scoped to the least privilege that still lets the
  tools you use succeed.

## Project layout

```
power-automate-mcp/
├── pyproject.toml            # packaging + entry point
├── requirements.txt
├── .env.example
└── src/power_automate_mcp/
    ├── __init__.py
    ├── __main__.py           # python -m power_automate_mcp
    ├── config.py             # env-var configuration
    ├── auth.py               # Entra ID token acquisition (MSAL)
    ├── client.py             # async Flow management API client
    └── server.py             # FastMCP tool definitions
```
