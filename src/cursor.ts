import type { CommandPolicy, CursorRunOptions, CursorRunResult, EvidenceEvent } from "./types.js";
import { resolveCursorAuth } from "./auth.js";
import { redactSecrets, safeError } from "./redact.js";
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
  const startedAt = Date.now();
  const evidenceEvents: EvidenceEvent[] = [];
  const policyViolations = new Set<string>();
  const commandPolicy = options.commandPolicy ?? "advisory-forbid";
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
    const run = await agent.send(message as never, {
      mode,
      onStep: ({ step }: { step: unknown }) => {
        recordEvidence(step, evidenceEvents, policyViolations, commandPolicy);
      },
      onDelta: ({ update }: { update: unknown }) => {
        recordEvidence(update, evidenceEvents, policyViolations, commandPolicy);
      }
    } as never);

    const waitPromise = run.wait();
    const result = options.timeoutMs
      ? await waitWithTimeout(waitPromise, options.timeoutMs)
      : await waitPromise;

    if (result === "timeout") {
      waitPromise.catch(() => undefined);
      let cancelled = false;
      try {
        await run.cancel();
        cancelled = true;
      } catch (error) {
        evidenceEvents.push({
          type: "cancel_error",
          message: safeError(error, [auth.apiKey])
        });
      }

      return {
        text: run.result ?? "",
        runId: run.id,
        agentId: run.agentId,
        status: "cancelled",
        model,
        durationMs: Date.now() - startedAt,
        timedOut: true,
        cancelled,
        evidence: {
          events: evidenceEvents,
          policyViolations: [...policyViolations]
        }
      };
    }

    return {
      text: result.result ?? run.result ?? "",
      runId: result.id ?? run.id,
      agentId: run.agentId,
      status: result.status,
      model,
      durationMs: result.durationMs,
      timedOut: false,
      cancelled: false,
      evidence: {
        events: evidenceEvents,
        policyViolations: [...policyViolations]
      }
    };
  } finally {
    agent.close();
  }
}

async function loadCursorSdk(): Promise<typeof import("@cursor/sdk")> {
  return import("@cursor/sdk");
}

async function waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | "timeout"> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T | "timeout">([
      promise,
      new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => resolve("timeout"), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function recordEvidence(
  value: unknown,
  events: EvidenceEvent[],
  policyViolations: Set<string>,
  commandPolicy: CommandPolicy
): void {
  if (events.length >= 100) return;

  const event = summarizeEvidence(value);
  if (commandPolicy === "advisory-forbid" && looksLikeCommandEvent(event)) {
    policyViolations.add("Composer appeared to use a shell/command tool despite commandPolicy=advisory-forbid.");
  }

  if (shouldRecordEvent(event)) {
    events.push(event);
  }
}

function summarizeEvidence(value: unknown): EvidenceEvent {
  if (!value || typeof value !== "object") {
    return {
      type: "event",
      message: truncate(redactSecrets(String(value)))
    };
  }

  const record = value as Record<string, unknown>;
  const type = firstString(record, ["type", "kind", "event", "status"]) ?? "event";
  const nestedTool = toolRecord(record);
  const name = nestedTool?.name ?? firstString(record, ["name", "toolName", "tool_name", "tool"]);
  const status = nestedTool?.status ?? firstString(record, ["status", "state"]);
  const message = summaryMessage(type, record, nestedTool);

  return {
    type,
    ...(name ? { name } : {}),
    ...(status ? { status } : {}),
    ...(message ? { message } : {})
  };
}

function toolRecord(record: Record<string, unknown>): { name?: string; status?: string } | undefined {
  const directTool = record.toolCall;
  if (directTool && typeof directTool === "object") {
    const tool = directTool as Record<string, unknown>;
    return {
      name: firstString(tool, ["type", "name"]),
      status: resultStatus(tool.result)
    };
  }

  const message = record.message;
  if (message && typeof message === "object") {
    const tool = message as Record<string, unknown>;
    return {
      name: firstString(tool, ["type", "name"]),
      status: resultStatus(tool.result)
    };
  }

  return undefined;
}

function resultStatus(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  return firstString(result as Record<string, unknown>, ["status", "state"]);
}

function summaryMessage(
  type: string,
  record: Record<string, unknown>,
  nestedTool: { name?: string; status?: string } | undefined
): string | undefined {
  if (nestedTool?.name) {
    return nestedTool.status ? `${nestedTool.name} ${nestedTool.status}` : nestedTool.name;
  }

  if (type === "step-completed") {
    const stepId = record.stepId;
    const duration = record.stepDurationMs;
    return `step ${String(stepId ?? "?")} completed${typeof duration === "number" ? ` in ${duration}ms` : ""}`;
  }

  if (type === "turn-ended") {
    const usage = record.usage;
    return usage ? truncate(redactSecrets(JSON.stringify({ usage })), 300) : "turn ended";
  }

  if (type === "status") return firstString(record, ["message"]);
  return undefined;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function looksLikeCommandEvent(event: EvidenceEvent): boolean {
  const typeAndName = `${event.type} ${event.name ?? ""}`.toLowerCase();
  return /\b(shell|terminal|bash|zsh|exec)\b/.test(typeAndName);
}

function shouldRecordEvent(event: EvidenceEvent): boolean {
  const haystack = `${event.type} ${event.name ?? ""}`.toLowerCase();
  if (/\b(token|text|thinking)/.test(haystack)) return false;
  return /\b(tool|status|step|turn|shell|terminal|bash|zsh|exec|command)/.test(haystack);
}

function truncate(value: string, maxLength = 1000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
