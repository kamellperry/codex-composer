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
      cwd: "/tmp/none",
      homeDir: "/tmp/none"
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("env");
    expect(result.apiKey).toBe("cursor_env_key");
  });

  it("uses local .env before Pi auth", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-auth-"));
    const home = mkdtempSync(join(tmpdir(), "codex-composer-home-"));
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(join(root, ".env"), "CURSOR_API_KEY=cursor_local_key\n");
    writeFileSync(
      join(home, ".pi", "agent", "auth.json"),
      JSON.stringify({ cursor: { key: "cursor_pi_key" } })
    );

    const result = resolveCursorAuth({ env: {}, cwd: root, homeDir: home });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("local-env");
    expect(result.apiKey).toBe("cursor_local_key");
  });

  it("falls back to Pi cursor auth", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-composer-home-"));
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(
      join(home, ".pi", "agent", "auth.json"),
      JSON.stringify({ cursor: { key: "cursor_pi_key" } })
    );

    const result = resolveCursorAuth({ env: {}, cwd: "/tmp/none", homeDir: home });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("pi-auth");
    expect(result.apiKey).toBe("cursor_pi_key");
  });
});
