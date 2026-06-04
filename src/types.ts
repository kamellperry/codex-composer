export type ComposerMode = "agent" | "plan";

export interface AuthResult {
  ok: boolean;
  source: "env" | "local-env" | "pi-auth" | "missing";
  apiKey?: string;
  message: string;
}

export interface CursorRunOptions {
  cwd: string;
  prompt: string;
  model?: string;
  mode?: ComposerMode;
  images?: ImageInput[];
}

export interface CursorRunResult {
  text: string;
  runId?: string;
  agentId?: string;
  status?: string;
  model?: string;
  durationMs?: number;
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
