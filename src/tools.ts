import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { buildFileContext } from "./file-context.js";
import { createSandbox } from "./sandbox.js";
import { collectDiff, initializeGitBaseline } from "./diff.js";
import { composerHealth, runComposer } from "./cursor.js";
import { askPrompt, patchPrompt, uiReviewPrompt } from "./prompts.js";
import { safeError } from "./redact.js";

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
  mode: z.enum(["agent", "plan"]).default("plan")
};

export const patchSchema = {
  cwd: z.string().default(process.cwd()),
  prompt: z.string().min(1),
  files: z.array(z.string()).default([]),
  model: z.string().default("composer-2.5")
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
  model: z.string().default("composer-2.5")
};

export async function handleHealth(input: z.infer<z.ZodObject<typeof healthSchema>>) {
  return jsonContent(await composerHealth(input));
}

export async function handleAsk(input: z.infer<z.ZodObject<typeof askSchema>>) {
  const cwd = resolve(input.cwd);
  assertDirectory(cwd);

  const context = buildFileContext({ cwd, files: input.files });
  const sandbox = await createSandbox({ sourceDir: cwd, files: input.files });

  try {
    const result = await runComposer({
      cwd: sandbox.sandboxDir,
      model: input.model,
      mode: input.mode,
      prompt: askPrompt({
        prompt: input.prompt,
        cwd,
        mode: input.mode,
        fileContext: context.block
      })
    });

    return jsonContent({
      ...result,
      sandbox: sandboxSummary(sandbox),
      includedFiles: context.includedFiles,
      omittedFiles: [...context.omittedFiles, ...sandbox.omittedFiles]
    });
  } catch (error) {
    return jsonContent({ error: safeError(error) }, true);
  } finally {
    cleanupSandbox(sandbox.sandboxDir);
  }
}

export async function handlePatch(input: z.infer<z.ZodObject<typeof patchSchema>>) {
  const cwd = resolve(input.cwd);
  assertDirectory(cwd);

  const context = buildFileContext({ cwd, files: input.files });
  const sandbox = await createSandbox({ sourceDir: cwd, files: input.files });

  try {
    await initializeGitBaseline(sandbox.sandboxDir);
    const result = await runComposer({
      cwd: sandbox.sandboxDir,
      model: input.model,
      mode: "agent",
      prompt: patchPrompt({
        prompt: input.prompt,
        cwd,
        fileContext: context.block
      })
    });
    const diff = await collectDiff(sandbox.sandboxDir);

    return jsonContent({
      ...result,
      diff,
      changed: diff.length > 0,
      sandbox: sandboxSummary(sandbox),
      includedFiles: context.includedFiles,
      omittedFiles: [...context.omittedFiles, ...sandbox.omittedFiles],
      note: "Diff was produced from a temporary sandbox. The real working tree was not modified."
    });
  } catch (error) {
    return jsonContent({ error: safeError(error) }, true);
  } finally {
    cleanupSandbox(sandbox.sandboxDir);
  }
}

export async function handleUiReview(input: z.infer<z.ZodObject<typeof uiReviewSchema>>) {
  const cwd = input.cwd ? resolve(input.cwd) : process.cwd();
  if (input.cwd) assertDirectory(cwd);

  const context = input.cwd ? buildFileContext({ cwd, files: input.files }) : { block: "", includedFiles: [], omittedFiles: [] };
  const sandbox = input.cwd ? await createSandbox({ sourceDir: cwd, files: input.files }) : undefined;

  try {
    const result = await runComposer({
      cwd: sandbox?.sandboxDir ?? process.cwd(),
      model: input.model,
      mode: "plan",
      images: input.images,
      prompt: uiReviewPrompt({
        prompt: input.prompt,
        cwd: input.cwd ? cwd : undefined,
        fileContext: context.block
      })
    });

    return jsonContent({
      ...result,
      sandbox: sandbox ? sandboxSummary(sandbox) : undefined,
      includedFiles: context.includedFiles,
      omittedFiles: [...context.omittedFiles, ...(sandbox?.omittedFiles ?? [])]
    });
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

function sandboxSummary(sandbox: { copiedFiles: string[]; copiedBytes: number }) {
  return {
    copiedFiles: sandbox.copiedFiles.length,
    copiedBytes: sandbox.copiedBytes
  };
}

function cleanupSandbox(path: string): void {
  if (process.env.CODEX_COMPOSER_KEEP_SANDBOX === "1") return;
  rmSync(path, { recursive: true, force: true });
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
