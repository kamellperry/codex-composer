---
name: codex-composer
description: Use when the user mentions Composer, Cursor Composer, composer-2.5, Codex Composer, asks to use Composer as a coding/UI/design specialist, or when non-trivial UI/design/code-review work would benefit from delegating to Cursor Composer through the Codex Composer plugin.
---

# Codex Composer

Use this skill when the user explicitly asks for Composer/Cursor Composer, or when a task benefits from a second specialist model for UI taste, design critique, code review, patch proposals, or larger sandboxed implementation.

Codex remains the operator. Composer is a specialist delegate, not the final authority. Codex still owns applying changes, inspecting diffs, running tests, launching previews, and verifying screenshots.

## Tool Map

Use the Codex Composer MCP tools exposed by this plugin:

- `composer_health`: check SDK/auth/model access before a first live use in a session, or when Composer behavior looks suspicious.
- `composer_ask`: get design direction, architecture guidance, critique, implementation specs, or second-model review. No edits.
- `composer_patch`: ask for a scoped sandboxed change when files and desired edit are known. Returns diff/artifacts; Codex applies separately.
- `composer_agent`: delegate a larger sandboxed objective that may create or edit multiple files. Returns diff/artifacts/evidence; Codex applies separately.
- `composer_ui_review`: send screenshot/image paths plus optional repo context for visual critique.

## Default Workflow

1. Prefer `composer_ask` for taste, design direction, critique, and planning.
2. Use `composer_patch` for small, bounded changes with known files.
3. Use `composer_agent` for larger implementation objectives, greenfield UI, or multi-file work.
4. Use `composer_ui_review` after Codex renders or screenshots UI locally.
5. Read Composer output skeptically: inspect `outputUsable`, `outputSource`, `outputRejectedReason`, and `outputCandidates` for advisory tools.
6. Never blindly apply Composer output. Review diff/artifacts, then edit the real working tree yourself.

## Safe Defaults

- Default model: `composer-2.5`.
- Default command policy: `advisory-forbid`; Composer is instructed not to run shell/build/test/package commands.
- Use `commandPolicy: "allow"` only when sandbox command execution is useful and safe.
- Use `files` whenever possible to constrain context and sandbox copy size.
- Use `keepSandbox: true` only for debugging failed or suspicious runs; otherwise let the tool clean it up.
- Do not send secrets intentionally. If Composer artifacts look secret-bearing, the plugin should omit them.

## When Output Is Bad

If Composer returns wrapper text, empty text, or generic filler:

1. Check `outputUsable` and `outputRejectedReason`.
2. Make one tighter retry only if it can materially improve the result.
3. If the second try is still thin, proceed locally and mention Composer was not useful.
4. For repeated failures, run `composer_health` and prefer `keepSandbox: true` on the next diagnostic run.

## UI And Design Use

For non-trivial frontend work:

- Ask Composer for a concise design principle, visual direction, must-show states, and avoid list before implementation.
- Give Composer concrete files, screenshots, product context, and user preferences.
- Do not outsource rendered verification. Codex must run the app, inspect the UI, and capture screenshots when appropriate.
- For image mockups, use Composer for direction and critique; Codex controls image generation and final selection.

## Patch And Agent Review Rules

For `composer_patch` and `composer_agent`:

- Treat returned `diff` and `artifacts` as proposals.
- Check `changedFiles`, `omittedFiles`, `omittedArtifacts`, `policyViolations`, `timedOut`, and `cancelled`.
- If `timedOut` is true, treat results as partial even when a diff exists.
- If `policyViolations` mentions command use under `advisory-forbid`, inspect carefully before applying.
- Apply only the parts that pass local judgment, then run the repo’s normal verification.
