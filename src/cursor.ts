import type { CursorRunOptions, CursorRunResult } from "./types.js";
import { resolveCursorAuth } from "./auth.js";
import { safeError } from "./redact.js";
import { toSdkImages } from "./images.js";

export interface ComposerHealth {
  ok: boolean;
  sdkAvailable: boolean;
  authAvailable: boolean;
  authSource: string;
  model: string;
  modelAccessible?: boolean;
  message: string;
  modelsChecked?: number;
}

const DEFAULT_MODEL = "composer-2.5";

export async function composerHealth(options: {
  cwd?: string;
  model?: string;
  live?: boolean;
} = {}): Promise<ComposerHealth> {
  const model = options.model ?? DEFAULT_MODEL;
  const auth = resolveCursorAuth({ cwd: options.cwd });

  let sdk: Awaited<ReturnType<typeof loadCursorSdk>>;
  try {
    sdk = await loadCursorSdk();
  } catch (error) {
    return {
      ok: false,
      sdkAvailable: false,
      authAvailable: auth.ok,
      authSource: auth.source,
      model,
      message: `Cursor SDK is not available: ${safeError(error, [auth.apiKey ?? ""])}`
    };
  }

  if (!auth.ok || !auth.apiKey) {
    return {
      ok: false,
      sdkAvailable: true,
      authAvailable: false,
      authSource: auth.source,
      model,
      message: auth.message
    };
  }

  if (!options.live) {
    return {
      ok: true,
      sdkAvailable: true,
      authAvailable: true,
      authSource: auth.source,
      model,
      message: "Cursor SDK is installed and auth is available. Live model access was not checked."
    };
  }

  try {
    const models = await sdk.Cursor.models.list({ apiKey: auth.apiKey });
    const modelAccessible = models.some((entry) => {
      return entry.id === model || entry.aliases?.includes(model);
    });

    return {
      ok: modelAccessible,
      sdkAvailable: true,
      authAvailable: true,
      authSource: auth.source,
      model,
      modelAccessible,
      modelsChecked: models.length,
      message: modelAccessible
        ? `Cursor model ${model} is accessible.`
        : `Cursor model ${model} was not found in the live model catalog.`
    };
  } catch (error) {
    return {
      ok: false,
      sdkAvailable: true,
      authAvailable: true,
      authSource: auth.source,
      model,
      message: `Live Cursor model check failed: ${safeError(error, [auth.apiKey])}`
    };
  }
}

export async function runComposer(options: CursorRunOptions): Promise<CursorRunResult> {
  const auth = resolveCursorAuth({ cwd: process.cwd() });
  if (!auth.ok || !auth.apiKey) {
    throw new Error(auth.message);
  }

  const { Agent } = await loadCursorSdk();
  const model = options.model ?? DEFAULT_MODEL;
  const mode = options.mode ?? "plan";
  const message =
    options.images?.length
      ? {
          text: options.prompt,
          images: toSdkImages(options.images)
        }
      : options.prompt;

  const agent = await Agent.create({
    apiKey: auth.apiKey,
    model: { id: model },
    local: {
      cwd: options.cwd,
      sandboxOptions: { enabled: true },
      settingSources: ["project", "plugins"]
    },
    mode
  } as never);

  try {
    const run = await agent.send(message as never, { mode } as never);
    const result = await run.wait();
    return {
      text: result.result ?? run.result ?? "",
      runId: result.id ?? run.id,
      agentId: run.agentId,
      status: result.status,
      model,
      durationMs: result.durationMs
    };
  } finally {
    agent.close();
  }
}

async function loadCursorSdk(): Promise<typeof import("@cursor/sdk")> {
  return import("@cursor/sdk");
}
