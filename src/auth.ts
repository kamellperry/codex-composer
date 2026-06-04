import { join } from "node:path";
import type { AuthResult } from "./types.js";
import { readDotEnvValue } from "./env.js";

export interface ResolveAuthOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export function resolveCursorAuth(options: ResolveAuthOptions = {}): AuthResult {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();

  const envKey = cleanKey(env.CURSOR_API_KEY);
  if (envKey) {
    return {
      ok: true,
      source: "env",
      apiKey: envKey,
      message: "Cursor API key found in CURSOR_API_KEY."
    };
  }

  const envFile = cleanKey(env.CODEX_COMPOSER_ENV_FILE);
  if (envFile) {
    const envFileKey = cleanKey(readDotEnvValue(envFile, "CURSOR_API_KEY"));
    if (envFileKey) {
      return {
        ok: true,
        source: "env-file",
        apiKey: envFileKey,
        message: "Cursor API key found in CODEX_COMPOSER_ENV_FILE."
      };
    }
  }

  const localEnvKey = cleanKey(readDotEnvValue(join(cwd, ".env"), "CURSOR_API_KEY"));
  if (localEnvKey) {
    return {
      ok: true,
      source: "local-env",
      apiKey: localEnvKey,
      message: "Cursor API key found in local .env."
    };
  }

  return {
    ok: false,
    source: "missing",
    message: "No Cursor SDK API key found. Set CURSOR_API_KEY or add it to local .env."
  };
}

function cleanKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
