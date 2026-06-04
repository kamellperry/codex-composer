import { rmSync } from "node:fs";
import { buildFileContext } from "./file-context.js";
import { collectArtifacts } from "./artifacts.js";
import { collectChangedFiles, collectDiff, initializeGitBaseline } from "./diff.js";
import { runComposer } from "./cursor.js";
import { createSandbox } from "./sandbox.js";
import { safeError } from "./redact.js";
import type {
  ChangedFile,
  CommandPolicy,
  CursorRunOptions,
  CursorRunResult,
  FileArtifact,
  OmittedArtifact,
  SandboxResult
} from "./types.js";

export type ComposerRunner = (options: CursorRunOptions) => Promise<CursorRunResult>;

export interface SandboxedChangeOptions {
  cwd: string;
  files: string[];
  prompt: string;
  model: string;
  commandPolicy: CommandPolicy;
  includeArtifacts: boolean;
  maxArtifactBytes: number;
  timeoutMs: number;
  keepSandbox: boolean;
  runner?: ComposerRunner;
}

export async function runSandboxedChange(options: SandboxedChangeOptions) {
  const runner = options.runner ?? runComposer;
  const context = buildFileContext({ cwd: options.cwd, files: options.files });
  const sandbox = await createSandbox({ sourceDir: options.cwd, files: options.files });
  const keepSandbox = shouldKeepSandbox(options.keepSandbox);

  let runResult: CursorRunResult | undefined;
  let runError: string | undefined;
  let diff = "";
  let changedFiles: ChangedFile[] = [];
  let artifacts: FileArtifact[] = [];
  let omittedArtifacts: OmittedArtifact[] = [];
  let partialResultsCollected = false;
  let collectionError: string | undefined;

  try {
    try {
      await initializeGitBaseline(sandbox.sandboxDir);
    } catch (error) {
      runError = safeError(error);
    }

    if (!runError) {
      try {
        runResult = await runner({
          cwd: sandbox.sandboxDir,
          model: options.model,
          mode: "agent",
          prompt: options.prompt,
          timeoutMs: options.timeoutMs,
          commandPolicy: options.commandPolicy
        });
      } catch (error) {
        runError = safeError(error);
      }
    }

    try {
      diff = await collectDiff(sandbox.sandboxDir);
      changedFiles = await collectChangedFiles(sandbox.sandboxDir);
      if (options.includeArtifacts) {
        const collected = collectArtifacts({
          root: sandbox.sandboxDir,
          changedFiles,
          maxArtifactBytes: options.maxArtifactBytes
        });
        artifacts = collected.artifacts;
        omittedArtifacts = collected.omittedArtifacts;
      }
      partialResultsCollected = true;
    } catch (error) {
      collectionError = safeError(error);
    }

    return {
      isError: Boolean(runError || collectionError),
      value: {
        text: runResult?.text ?? "",
        runId: runResult?.runId,
        agentId: runResult?.agentId,
        status: runResult?.status,
        model: runResult?.model ?? options.model,
        durationMs: runResult?.durationMs,
        timedOut: runResult?.timedOut ?? false,
        cancelled: runResult?.cancelled ?? false,
        error: runError,
        collectionError,
        diff,
        changed: diff.length > 0,
        changedFiles,
        artifacts,
        omittedArtifacts,
        sandbox: sandboxSummary(sandbox, keepSandbox),
        includedFiles: context.includedFiles,
        omittedFiles: [...context.omittedFiles, ...sandbox.omittedFiles],
        evidence: {
          commandPolicy: options.commandPolicy,
          events: runResult?.evidence?.events ?? [],
          policyViolations: runResult?.evidence?.policyViolations ?? [],
          copiedFiles: sandbox.copiedFiles,
          omittedFiles: [...context.omittedFiles, ...sandbox.omittedFiles],
          changedFiles,
          partialResultsCollected,
          sandboxKept: keepSandbox
        },
        note: "Composer ran in a temporary sandbox. The real working tree was not modified."
      }
    };
  } finally {
    if (!keepSandbox) cleanupSandbox(sandbox.sandboxDir);
  }
}

function sandboxSummary(sandbox: SandboxResult, keepSandbox: boolean) {
  return {
    copiedFiles: sandbox.copiedFiles.length,
    copiedBytes: sandbox.copiedBytes,
    kept: keepSandbox,
    ...(keepSandbox ? { path: sandbox.sandboxDir } : {})
  };
}

function shouldKeepSandbox(keepSandbox: boolean): boolean {
  return keepSandbox || process.env.CODEX_COMPOSER_KEEP_SANDBOX === "1";
}

function cleanupSandbox(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
