import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AuthResult } from "./types.js";
import { readDotEnvValue } from "./env.js";

export interface ResolveAuthOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
}

export function resolveCursorAuth(options: ResolveAuthOptions = {}): AuthResult {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();

  const envKey = cleanKey(env.CURSOR_API_KEY);
  if (envKey) {
    return {
      ok: true,
      source: "env",
      apiKey: envKey,
      message: "Cursor API key found in CURSOR_API_KEY."
    };
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

  const piAuthPath = join(homeDir, ".pi", "agent", "auth.json");
  const piKey = cleanKey(readPiCursorKey(piAuthPath));
  if (piKey) {
    return {
      ok: true,
      source: "pi-auth",
      apiKey: piKey,
      message: "Cursor API key found in Pi auth."
    };
  }

  return {
    ok: false,
    source: "missing",
    message:
      "No Cursor SDK API key found. Set CURSOR_API_KEY, add it to local .env, or save it in Pi auth."
  };
}

function cleanKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPiCursorKey(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!data || typeof data !== "object") return undefined;

  const cursor = (data as Record<string, unknown>).cursor;
  if (!cursor || typeof cursor !== "object") return undefined;

  const key = (cursor as Record<string, unknown>).key;
  return typeof key === "string" ? key : undefined;
}
