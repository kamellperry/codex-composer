import { redactSecrets } from "./redact.js";

export type ComposerOutputSource =
  | "run-result"
  | "conversation-assistant"
  | "conversation-createPlan"
  | "conversation-task"
  | "stream-assistant"
  | "stream-task";

export interface ComposerOutputCandidate {
  source: ComposerOutputSource;
  length: number;
  usable: boolean;
  reason?: string;
}

export interface ComposerOutputExtraction {
  text: string;
  source?: ComposerOutputSource;
  usable: boolean;
  rejectedReason?: string;
  candidates: ComposerOutputCandidate[];
}

interface CandidateWithText {
  source: ComposerOutputSource;
  text: string;
}

export function extractComposerOutput(input: {
  runResultText?: string;
  conversation?: unknown;
  streamCandidates?: Array<{ source: ComposerOutputSource; text: string }>;
}): ComposerOutputExtraction {
  const candidates: CandidateWithText[] = [];

  addCandidate(candidates, "run-result", input.runResultText);
  collectConversationCandidates(input.conversation, candidates);
  for (const candidate of input.streamCandidates ?? []) {
    addCandidate(candidates, candidate.source, candidate.text);
  }

  const scored = candidates.map((candidate) => scoreCandidate(candidate));
  const usable = selectBestCandidate(candidates, scored);
  if (usable) {
    return {
      text: usable.text,
      source: usable.source,
      usable: true,
      candidates: scored
    };
  }

  return {
    text: normalizeText(input.runResultText ?? ""),
    usable: false,
    rejectedReason: scored.length
      ? "Composer finished but only produced wrapper, redacted, or empty output."
      : "Composer finished without producing assistant output.",
    candidates: scored
  };
}

function collectConversationCandidates(value: unknown, candidates: CandidateWithText[]): void {
  if (!value) return;
  const turns = Array.isArray(value) ? value : [value];

  for (const turn of turns) {
    if (!turn || typeof turn !== "object") continue;
    const record = turn as Record<string, unknown>;

    if (record.type === "agentConversationTurn") {
      collectSdkConversationTurn(record, candidates);
      continue;
    }

    if (record.role === "assistant") {
      collectTranscriptAssistantMessage(record, candidates);
    }

    if (record.type === "assistant") {
      collectSdkAssistantMessage(record, candidates);
    }

    if (record.type === "task") {
      addCandidate(candidates, "conversation-task", stringValue(record.text));
    }
  }
}

function collectSdkConversationTurn(record: Record<string, unknown>, candidates: CandidateWithText[]): void {
  const turn = objectValue(record.turn);
  const steps = arrayValue(turn?.steps);
  for (const step of steps) {
    const stepRecord = objectValue(step);
    if (!stepRecord) continue;

    if (stepRecord.type === "assistantMessage") {
      addCandidate(candidates, "conversation-assistant", stringValue(objectValue(stepRecord.message)?.text));
      continue;
    }

    if (stepRecord.type === "toolCall") {
      collectToolCallCandidate(objectValue(stepRecord.message), candidates);
    }
  }
}

function collectTranscriptAssistantMessage(record: Record<string, unknown>, candidates: CandidateWithText[]): void {
  const content = arrayValue(objectValue(record.message)?.content);
  for (const block of content) {
    const blockRecord = objectValue(block);
    if (!blockRecord) continue;

    if (blockRecord.type === "text") {
      addCandidate(candidates, "conversation-assistant", stringValue(blockRecord.text));
    } else if (blockRecord.type === "tool_use") {
      collectToolUseBlockCandidate(blockRecord, candidates);
    }
  }
}

function collectSdkAssistantMessage(record: Record<string, unknown>, candidates: CandidateWithText[]): void {
  const content = arrayValue(objectValue(record.message)?.content);
  for (const block of content) {
    const blockRecord = objectValue(block);
    if (blockRecord?.type === "text") {
      addCandidate(candidates, "conversation-assistant", stringValue(blockRecord.text));
    } else if (blockRecord?.type === "tool_use") {
      collectToolUseBlockCandidate(blockRecord, candidates);
    }
  }
}

function collectToolUseBlockCandidate(record: Record<string, unknown>, candidates: CandidateWithText[]): void {
  const name = stringValue(record.name)?.toLowerCase();
  const input = objectValue(record.input);
  if (name === "createplan") {
    addCandidate(candidates, "conversation-createPlan", stringValue(input?.plan));
  }
}

function collectToolCallCandidate(record: Record<string, unknown> | undefined, candidates: CandidateWithText[]): void {
  if (!record) return;
  const type = stringValue(record.type)?.toLowerCase();
  const args = objectValue(record.args);
  if (type === "createplan") {
    addCandidate(candidates, "conversation-createPlan", stringValue(args?.plan));
  } else if (type === "task") {
    addCandidate(candidates, "conversation-task", stringValue(args?.prompt));
  }
}

function addCandidate(candidates: CandidateWithText[], source: ComposerOutputSource, text: string | undefined): void {
  const normalized = normalizeText(text ?? "");
  if (!normalized) return;
  candidates.push({ source, text: normalized });
}

function selectBestCandidate(candidates: CandidateWithText[], scored: ComposerOutputCandidate[]): CandidateWithText | undefined {
  const priorities: ComposerOutputSource[] = [
    "conversation-assistant",
    "conversation-createPlan",
    "run-result",
    "stream-assistant",
    "conversation-task",
    "stream-task"
  ];

  for (const source of priorities) {
    const index = candidates.findIndex((candidate, candidateIndex) => {
      return candidate.source === source && scored[candidateIndex]?.usable;
    });
    if (index >= 0) return candidates[index];
  }

  return undefined;
}

function scoreCandidate(candidate: CandidateWithText): ComposerOutputCandidate {
  const reason = rejectionReason(candidate.text);
  return {
    source: candidate.source,
    length: candidate.text.length,
    usable: !reason,
    ...(reason ? { reason } : {})
  };
}

function rejectionReason(text: string): string | undefined {
  const normalized = normalizeText(text);
  if (!normalized) return "empty";

  const withoutRedactions = normalizeText(normalized.replace(/\[REDACTED\]/gi, ""));
  if (!withoutRedactions) return "redacted-only";

  if (looksLikeWrapper(withoutRedactions)) return "wrapper-only";
  return undefined;
}

function looksLikeWrapper(text: string): boolean {
  const normalized = normalizeText(text);
  if (normalized.length > 260) return false;
  if (hasAnswerStructure(normalized)) return false;

  return (
    /^(i['’]?ll|i will|i am going to|i['’]?m going to|let me)\b/i.test(normalized) ||
    /^the request is\b/i.test(normalized) ||
    /^five sections, grounded\b/i.test(normalized) ||
    /\bi['’]?ll synthesize\b/i.test(normalized) ||
    /\bgrounded in\b.+\bpreferences\b/i.test(normalized)
  );
}

function hasAnswerStructure(text: string): boolean {
  return (
    /(^|\n)#{1,6}\s+\S/.test(text) ||
    /(^|\n)\s*[-*]\s+\S/.test(text) ||
    /(^|\n)\s*\d+[.)]\s+\S/.test(text) ||
    /\n\n\S/.test(text)
  );
}

function normalizeText(text: string): string {
  return redactSecrets(text).replace(/\r\n/g, "\n").trim();
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
