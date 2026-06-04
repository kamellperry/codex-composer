export type ComposerMode = "agent" | "plan";
export type CommandPolicy = "advisory-forbid" | "allow";

export interface AuthResult {
  ok: boolean;
  source: "env" | "env-file" | "local-env" | "missing";
  apiKey?: string;
  message: string;
}

export interface CursorRunOptions {
  cwd: string;
  prompt: string;
  model?: string;
  mode?: ComposerMode;
  images?: ImageInput[];
  timeoutMs?: number;
  commandPolicy?: CommandPolicy;
}

export interface CursorRunResult {
  text: string;
  runId?: string;
  agentId?: string;
  status?: string;
  model?: string;
  durationMs?: number;
  timedOut?: boolean;
  cancelled?: boolean;
  evidence?: RunEvidence;
}

export interface EvidenceEvent {
  type: string;
  name?: string;
  status?: string;
  message?: string;
}

export interface RunEvidence {
  events: EvidenceEvent[];
  policyViolations: string[];
}

export interface ImageInput {
  path: string;
  mimeType?: string;
}

export interface SandboxOptions {
  sourceDir: string;
  files?: string[];
  maxFiles?: number;
  maxBytes?: number;
}

export interface SandboxResult {
  sandboxDir: string;
  copiedFiles: string[];
  omittedFiles: string[];
  copiedBytes: number;
}

export type ChangedFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "unknown";

export interface ChangedFile {
  path: string;
  status: ChangedFileStatus;
  originalPath?: string;
}

export interface FileArtifact {
  path: string;
  status: ChangedFileStatus;
  content: string;
  sizeBytes: number;
}

export interface OmittedArtifact {
  path: string;
  status?: ChangedFileStatus;
  reason: string;
}
