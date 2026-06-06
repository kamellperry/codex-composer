import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { buildFileContext } from "./file-context.js";
import { createSandbox } from "./sandbox.js";
import { composerHealth, runComposer } from "./cursor.js";
import { agentPrompt, askPrompt, patchPrompt, uiReviewPrompt } from "./prompts.js";
import { safeError } from "./redact.js";
import { type ComposerRunner, runSandboxedChange } from "./sandboxed-run.js";

export const healthSchema = {
  cwd: z.string().optional(),
  model: z.string().default("composer-2.5"),
  live: z.boolean().default(true)
};

export const askSchema = {
  cwd: z.string().default(process.cwd()),
  prompt: z.string().min(1),
  files: z.array(z.string()).default([]),
  model: z.string().default("composer-2.5"),
  mode: z.enum(["agent", "plan"]).default("plan"),
  timeoutMs: z.number().int().positive().default(120_000),
  keepSandbox: z.boolean().default(false)
};

export const patchSchema = {
  cwd: z.string().default(process.cwd()),
  prompt: z.string().min(1),
  files: z.array(z.string()).default([]),
  model: z.string().default("composer-2.5"),
  commandPolicy: z.enum(["advisory-forbid", "allow"]).default("advisory-forbid"),
  includeArtifacts: z.boolean().default(true),
  maxArtifactBytes: z.number().int().positive().default(256 * 1024),
  timeoutMs: z.number().int().positive().default(300_000),
  keepSandbox: z.boolean().default(false)
};

export const agentSchema = {
  cwd: z.string().default(process.cwd()),
  objective: z.string().min(1),
  files: z.array(z.string()).default([]),
  model: z.string().default("composer-2.5"),
  commandPolicy: z.enum(["advisory-forbid", "allow"]).default("advisory-forbid"),
  includeArtifacts: z.boolean().default(true),
  maxArtifactBytes: z.number().int().positive().default(256 * 1024),
  timeoutMs: z.number().int().positive().default(600_000),
  keepSandbox: z.boolean().default(false)
};

export const uiReviewSchema = {
  cwd: z.string().optional(),
  prompt: z.string().min(1),
  files: z.array(z.string()).default([]),
  images: z
    .array(
      z.object({
        path: z.string(),
        mimeType: z.string().optional()
      })
    )
    .min(1),
  model: z.string().default("composer-2.5"),
  timeoutMs: z.number().int().positive().default(120_000)
};

export async function handleHealth(input: z.infer<z.ZodObject<typeof healthSchema>>) {
  return jsonContent(await composerHealth(input));
}

export async function handleAsk(input: z.infer<z.ZodObject<typeof askSchema>>) {
  return handleAskWithRunner(input);
}

export async function handleAskWithRunner(
  input: z.infer<z.ZodObject<typeof askSchema>>,
  runner: ComposerRunner = runComposer
) {
  const cwd = resolve(input.cwd);
  assertDirectory(cwd);

  const context = buildFileContext({ cwd, files: input.files });
  const sandbox = await createSandbox({ sourceDir: cwd, files: input.files });
  const keepSandbox = shouldKeepSandbox(input.keepSandbox);

  try {
    const result = await runner({
      cwd: sandbox.sandboxDir,
      model: input.model,
      mode: input.mode,
      timeoutMs: input.timeoutMs,
      prompt: askPrompt({
        prompt: input.prompt,
        cwd,
        mode: input.mode,
        fileContext: context.block
      })
    });

    const value = {
      ...result,
      sandbox: sandboxSummary(sandbox, keepSandbox),
      includedFiles: context.includedFiles,
      omittedFiles: [...context.omittedFiles, ...sandbox.omittedFiles]
    };

    return jsonContent(value, isUnusableAdvisoryResult(result));
  } catch (error) {
    return jsonContent({ error: safeError(error) }, true);
  } finally {
    if (!keepSandbox) cleanupSandbox(sandbox.sandboxDir);
  }
}

export async function handlePatch(input: z.infer<z.ZodObject<typeof patchSchema>>) {
  return handlePatchWithRunner(input);
}

export async function handlePatchWithRunner(
  input: z.infer<z.ZodObject<typeof patchSchema>>,
  runner?: ComposerRunner
) {
  const cwd = resolve(input.cwd);
  assertDirectory(cwd);

  const context = buildFileContext({ cwd, files: input.files });
  const result = await runSandboxedChange({
    cwd,
    files: input.files,
    model: input.model,
    commandPolicy: input.commandPolicy,
    includeArtifacts: input.includeArtifacts,
    maxArtifactBytes: input.maxArtifactBytes,
    timeoutMs: input.timeoutMs,
    keepSandbox: input.keepSandbox,
    runner,
    prompt: patchPrompt({
      prompt: input.prompt,
      cwd,
      commandPolicy: input.commandPolicy,
      fileContext: context.block
    })
  });

  return jsonContent(result.value, result.isError);
}

export async function handleAgent(input: z.infer<z.ZodObject<typeof agentSchema>>) {
  return handleAgentWithRunner(input);
}

export async function handleAgentWithRunner(
  input: z.infer<z.ZodObject<typeof agentSchema>>,
  runner?: ComposerRunner
) {
  const cwd = resolve(input.cwd);
  assertDirectory(cwd);

  const context = buildFileContext({ cwd, files: input.files });
  const result = await runSandboxedChange({
    cwd,
    files: input.files,
    model: input.model,
    commandPolicy: input.commandPolicy,
    includeArtifacts: input.includeArtifacts,
    maxArtifactBytes: input.maxArtifactBytes,
    timeoutMs: input.timeoutMs,
    keepSandbox: input.keepSandbox,
    runner,
    prompt: agentPrompt({
      objective: input.objective,
      cwd,
      commandPolicy: input.commandPolicy,
      fileContext: context.block
    })
  });

  return jsonContent(result.value, result.isError);
}

export async function handleUiReview(input: z.infer<z.ZodObject<typeof uiReviewSchema>>) {
  return handleUiReviewWithRunner(input);
}

export async function handleUiReviewWithRunner(
  input: z.infer<z.ZodObject<typeof uiReviewSchema>>,
  runner: ComposerRunner = runComposer
) {
  const cwd = input.cwd ? resolve(input.cwd) : process.cwd();
  if (input.cwd) assertDirectory(cwd);

  const context = input.cwd ? buildFileContext({ cwd, files: input.files }) : { block: "", includedFiles: [], omittedFiles: [] };
  const sandbox = input.cwd ? await createSandbox({ sourceDir: cwd, files: input.files }) : undefined;

  try {
    const result = await runner({
      cwd: sandbox?.sandboxDir ?? process.cwd(),
      model: input.model,
      mode: "plan",
      images: input.images,
      timeoutMs: input.timeoutMs,
      prompt: uiReviewPrompt({
        prompt: input.prompt,
        cwd: input.cwd ? cwd : undefined,
        fileContext: context.block
      })
    });

    const value = {
      ...result,
      sandbox: sandbox ? sandboxSummary(sandbox) : undefined,
      includedFiles: context.includedFiles,
      omittedFiles: [...context.omittedFiles, ...(sandbox?.omittedFiles ?? [])]
    };

    return jsonContent(value, isUnusableAdvisoryResult(result));
  } catch (error) {
    return jsonContent({ error: safeError(error) }, true);
  } finally {
    if (sandbox) cleanupSandbox(sandbox.sandboxDir);
  }
}

function assertDirectory(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`Directory does not exist: ${path}`);
  }
}

function sandboxSummary(
  sandbox: { sandboxDir?: string; copiedFiles: string[]; copiedBytes: number },
  keepSandbox = false
) {
  return {
    copiedFiles: sandbox.copiedFiles.length,
    copiedBytes: sandbox.copiedBytes,
    ...(keepSandbox ? { kept: true, path: sandbox.sandboxDir } : {})
  };
}

function cleanupSandbox(path: string): void {
  if (process.env.CODEX_COMPOSER_KEEP_SANDBOX === "1") return;
  rmSync(path, { recursive: true, force: true });
}

function shouldKeepSandbox(keepSandbox: boolean): boolean {
  return keepSandbox || process.env.CODEX_COMPOSER_KEEP_SANDBOX === "1";
}

function isUnusableAdvisoryResult(result: { outputUsable?: boolean; timedOut?: boolean }): boolean {
  return result.timedOut === true || result.outputUsable === false;
}

export function jsonContent(value: unknown, isError = false) {
  return {
    isError,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
