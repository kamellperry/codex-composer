import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSandbox } from "../src/sandbox.js";

describe("createSandbox", () => {
  it("copies selected files and excludes node_modules", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-source-"));
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export const value = 1;\n");
    writeFileSync(join(root, "node_modules", "pkg", "index.js"), "ignored\n");

    const sandbox = await createSandbox({ sourceDir: root });

    expect(existsSync(join(sandbox.sandboxDir, "src", "index.ts"))).toBe(true);
    expect(existsSync(join(sandbox.sandboxDir, "node_modules", "pkg", "index.js"))).toBe(false);
    expect(readFileSync(join(root, "src", "index.ts"), "utf8")).toContain("value = 1");
    expect(sandbox.omittedFiles.join("\n")).toContain("node_modules (ignored)");
  });

  it("copies only selected files when files are provided", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-source-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "selected.ts"), "selected\n");
    writeFileSync(join(root, "src", "other.ts"), "other\n");

    const sandbox = await createSandbox({ sourceDir: root, files: ["src/selected.ts"] });

    expect(existsSync(join(sandbox.sandboxDir, "src", "selected.ts"))).toBe(true);
    expect(existsSync(join(sandbox.sandboxDir, "src", "other.ts"))).toBe(false);
  });

  it("does not copy paths outside the source directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-source-"));
    const outside = mkdtempSync(join(tmpdir(), "codex-composer-outside-"));
    writeFileSync(join(outside, "secret.txt"), "secret\n");

    const sandbox = await createSandbox({
      sourceDir: root,
      files: [join("..", outside.split("/").pop() ?? "outside", "secret.txt")]
    });

    expect(sandbox.copiedFiles).toHaveLength(0);
    expect(sandbox.omittedFiles.join("\n")).toContain("outside source dir");
  });

  it("omits symlinks instead of following them", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-source-"));
    const outside = mkdtempSync(join(tmpdir(), "codex-composer-outside-"));
    writeFileSync(join(outside, "secret.txt"), "secret\n");
    symlinkSync(join(outside, "secret.txt"), join(root, "linked.txt"));

    const sandbox = await createSandbox({ sourceDir: root });

    expect(existsSync(join(sandbox.sandboxDir, "linked.txt"))).toBe(false);
    expect(sandbox.omittedFiles.join("\n")).toContain("linked.txt (symlink omitted)");
  });
});
