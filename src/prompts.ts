import type { ComposerMode } from "./types.js";
import type { CommandPolicy } from "./types.js";

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

export function patchPrompt(input: {
  prompt: string;
  cwd: string;
  commandPolicy: CommandPolicy;
  fileContext?: string;
}): string {
  return [
    "You are Cursor Composer 2.5 helping Codex produce a patch.",
    "You are running inside a temporary sandbox copy, not the real repository.",
    "Make the requested code changes directly in this sandbox.",
    "Keep the change minimal, production-friendly, and easy for Codex to review.",
    commandPolicyInstruction(input.commandPolicy),
    `Original repository path: ${input.cwd}.`,
    "",
    "User request:",
    input.prompt,
    input.fileContext ?? ""
  ].join("\n");
}

export function agentPrompt(input: {
  objective: string;
  cwd: string;
  commandPolicy: CommandPolicy;
  fileContext?: string;
}): string {
  return [
    "You are Cursor Composer 2.5 acting as a specialist implementation sub-agent for Codex.",
    "You are running inside a temporary sandbox copy, not the real repository.",
    "Complete the objective in the sandbox with focused, reviewable changes.",
    "You may create multiple files when the objective requires it.",
    "Return a concise summary of what changed and any verification you could or could not perform.",
    commandPolicyInstruction(input.commandPolicy),
    `Original repository path: ${input.cwd}.`,
    "",
    "Objective:",
    input.objective,
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

function commandPolicyInstruction(commandPolicy: CommandPolicy): string {
  if (commandPolicy === "allow") {
    return "Command policy: sandbox commands are allowed when they materially help the task.";
  }
  return [
    "Command policy: do not run shell, terminal, package-manager, test, build, or formatter commands.",
    "Use file reads/edits only. If command output would help, explain what Codex should run after reviewing the patch."
  ].join(" ");
}
