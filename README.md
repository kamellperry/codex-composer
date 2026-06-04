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
2. local `.env`
3. Pi's existing `~/.pi/agent/auth.json` cursor key

Keys are never printed by the tools.

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
