# Codex Composer

Codex Composer is a local Codex MCP plugin that lets Codex ask Cursor Composer 2.5 for coding, UI, and design help without giving Composer direct write access to the real working tree.

## What it does

- `composer_health`: checks local SDK availability, auth, and optional model access.
- `composer_ask`: asks Composer for design, critique, architecture, or implementation guidance without editing files, and fails loudly if Composer only returns wrapper text.
- `composer_patch`: asks Composer for a scoped sandboxed change and returns a diff plus safe text artifacts.
- `composer_agent`: delegates a larger sandboxed implementation objective and returns diff, artifacts, and evidence.
- `composer_ui_review`: sends screenshots/images plus context for UI and design critique.

## Safety model

Composer runs inside a temporary copy of the requested workspace. The real repo is not used as the Cursor agent's writable directory. Patch and agent modes return proposed work; Codex or a human applies it separately.

Use the tools this way:

- `composer_ask`: taste/design read, critique, spec, or second-model planning.
- `composer_patch`: quick scoped change, especially when the files are known.
- `composer_agent`: larger objective, greenfield/new-file work, or multi-file UI implementation.
- `composer_ui_review`: screenshot or visual artifact review.

Patch and agent output includes:

- `diff`: git diff from the sandbox.
- `changedFiles`: files changed in the sandbox, parsed with `git status --porcelain=v1 -z`.
- `artifacts`: safe text contents for created/modified files under the size cap.
- `omittedArtifacts`: binary, deleted, oversized, symlink, outside-sandbox, or secret-like files.
- `evidence`: run IDs, model/status/duration, copied/omitted files, changed files, policy warnings, timeout/cancel state, and safe tool-call summaries.

Advisory output includes:

- `text`: the best extracted Composer answer.
- `outputSource`: where that answer came from, such as `run-result`, `conversation-assistant`, or `conversation-createPlan`.
- `outputCandidates`: concise candidate diagnostics without duplicating hidden transcript content.
- `outputRejectedReason`: present when Composer finished but did not produce usable guidance.

Composer sometimes stores useful plan-mode output in SDK conversation steps rather than `run.result`. The plugin extracts the final assistant text first and falls back to `createPlan` plan text when the direct result is only a wrapper sentence. `composer_ask` and `composer_ui_review` return an MCP error when no useful advisory answer can be extracted.

Artifacts are intentionally conservative. If a changed file appears to contain an API key or similar secret, the tool omits the artifact instead of returning redacted content that might be applied accidentally.

`commandPolicy` controls command use:

- `advisory-forbid` (default): prompts Composer not to run shell, terminal, package-manager, build, test, or formatter commands. The current Cursor SDK does not expose a hard command-deny switch, so detected command-like tool use is reported as a policy violation.
- `allow`: explicitly permits commands inside the sandbox.

Set `keepSandbox: true` to keep the temporary sandbox and return its path for debugging. Otherwise the sandbox is deleted after diff/artifact collection.

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
bun run smoke:ask-design
bun run smoke:patch
bun run smoke:patch-empty
```

The smoke commands send live Composer prompts, so they require a valid Cursor SDK API key.
