import type { ComposerMode } from "./types.js";

export function askPrompt(input: {
  prompt: string;
  cwd: string;
  fileContext?: string;
  mode: ComposerMode;
}): string {
  return [
    "You are Cursor Composer 2.5 helping Codex.",
    "Do not edit files. Give concise, actionable guidance that Codex can execute.",
    `Requested mode: ${input.mode}.`,
    `Original repository path: ${input.cwd}.`,
    "",
    "User request:",
    input.prompt,
    input.fileContext ?? ""
  ].join("\n");
}

export function patchPrompt(input: { prompt: string; cwd: string; fileContext?: string }): string {
  return [
    "You are Cursor Composer 2.5 helping Codex produce a patch.",
    "You are running inside a temporary sandbox copy, not the real repository.",
    "Make the requested code changes directly in this sandbox.",
    "Keep the change minimal, production-friendly, and easy for Codex to review.",
    `Original repository path: ${input.cwd}.`,
    "",
    "User request:",
    input.prompt,
    input.fileContext ?? ""
  ].join("\n");
}

export function uiReviewPrompt(input: { prompt: string; cwd?: string; fileContext?: string }): string {
  return [
    "You are Cursor Composer 2.5 reviewing UI and product design for Codex.",
    "Do not edit files. Focus on concrete visual, interaction, layout, and implementation recommendations.",
    input.cwd ? `Original repository path: ${input.cwd}.` : "",
    "",
    "Review request:",
    input.prompt,
    input.fileContext ?? ""
  ]
    .filter(Boolean)
    .join("\n");
}
