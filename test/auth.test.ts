import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveCursorAuth } from "../src/auth.js";

describe("resolveCursorAuth", () => {
  it("prefers CURSOR_API_KEY", () => {
    const result = resolveCursorAuth({
      env: { CURSOR_API_KEY: "cursor_env_key" },
      cwd: "/tmp/none"
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("env");
    expect(result.apiKey).toBe("cursor_env_key");
  });

  it("uses local .env when shell env is absent", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-auth-"));
    writeFileSync(join(root, ".env"), "CURSOR_API_KEY=cursor_local_key\n");

    const result = resolveCursorAuth({ env: {}, cwd: root });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("local-env");
    expect(result.apiKey).toBe("cursor_local_key");
  });

  it("uses CODEX_COMPOSER_ENV_FILE before local .env", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-auth-"));
    const privateEnv = join(root, "private.env");
    writeFileSync(join(root, ".env"), "CURSOR_API_KEY=cursor_local_key\n");
    writeFileSync(privateEnv, "CURSOR_API_KEY=cursor_private_key\n");

    const result = resolveCursorAuth({
      env: { CODEX_COMPOSER_ENV_FILE: privateEnv },
      cwd: root
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("env-file");
    expect(result.apiKey).toBe("cursor_private_key");
  });

  it("does not read Pi auth as a fallback", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-composer-home-"));
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(
      join(home, ".pi", "agent", "auth.json"),
      JSON.stringify({ cursor: { key: "cursor_pi_key" } })
    );

    const result = resolveCursorAuth({ env: {}, cwd: home });

    expect(result.ok).toBe(false);
    expect(result.source).toBe("missing");
    expect(result.apiKey).toBeUndefined();
  });
});
