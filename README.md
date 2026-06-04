# Codex Composer

Codex Composer is a local Codex MCP plugin that lets Codex ask Cursor Composer 2.5 for coding, UI, and design help without giving Composer direct write access to the real working tree.

## What it does

- `composer_health`: checks local SDK availability, auth, and optional model access.
- `composer_ask`: asks Composer for advice against a repo snapshot and optional files.
- `composer_patch`: runs Composer in a temporary sandbox and returns a diff for Codex to inspect and apply.
- `composer_ui_review`: sends screenshots/images plus context for UI and design critique.

## Safety model

Composer runs inside a temporary copy of the requested workspace. The real repo is not used as the Cursor agent's writable directory. Patch mode returns a diff; Codex or a human applies it separately.

Auth resolution order:

1. `CURSOR_API_KEY`
2. `CODEX_COMPOSER_ENV_FILE=/path/to/.env`
3. local `.env`

Keys are never printed by the tools.

For a distributed Codex plugin install, set `CURSOR_API_KEY` in the environment that launches Codex. For local installs, prefer `CODEX_COMPOSER_ENV_FILE` if the plugin runs from a cache directory. The `.env` file is intended for local development and smoke tests from this checkout; it is ignored by Git and should not be packaged.

## Install

```bash
bun install
bun run build
```

Then enable the plugin in Codex through its plugin manifest, or run the MCP server directly:

```bash
node dist/server.js
```

## Smoke tests

```bash
bun run verify
bun run smoke:health
bun run smoke:ask
```

`smoke:ask` sends a live Composer prompt, so it requires a valid Cursor SDK API key.
