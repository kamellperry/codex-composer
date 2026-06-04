import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectArtifacts } from "../src/artifacts.js";
import type { ChangedFile } from "../src/types.js";

describe("collectArtifacts", () => {
  it("returns safe changed text files", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-artifacts-"));
    writeFileSync(join(root, "created.txt"), "hello\n");

    const result = collectArtifacts({
      root,
      changedFiles: [{ path: "created.txt", status: "added" }]
    });

    expect(result.artifacts).toEqual([
      {
        path: "created.txt",
        status: "added",
        content: "hello\n",
        sizeBytes: 6
      }
    ]);
    expect(result.omittedArtifacts).toEqual([]);
  });

  it("omits deleted, binary, oversized, secret-like, and symlink files", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-artifacts-"));
    const outside = mkdtempSync(join(tmpdir(), "codex-composer-artifacts-outside-"));
    writeFileSync(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
    writeFileSync(join(root, "large.txt"), `${"x".repeat(100)}\n`);
    writeFileSync(join(root, "secret.env"), "CURSOR_API_KEY=cursor_secret_123456789\n");
    writeFileSync(join(outside, "outside.txt"), "outside\n");
    symlinkSync(join(outside, "outside.txt"), join(root, "linked.txt"));

    const changedFiles: ChangedFile[] = [
      { path: "deleted.txt", status: "deleted" },
      { path: "binary.bin", status: "modified" },
      { path: "large.txt", status: "modified" },
      { path: "secret.env", status: "modified" },
      { path: "linked.txt", status: "modified" }
    ];

    const result = collectArtifacts({
      root,
      changedFiles,
      maxArtifactBytes: 64
    });

    expect(result.artifacts).toEqual([]);
    expect(result.omittedArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "deleted.txt", reason: "deleted" }),
        expect.objectContaining({ path: "binary.bin", reason: "binary" }),
        expect.objectContaining({ path: "large.txt", reason: "oversized" }),
        expect.objectContaining({ path: "secret.env", reason: "secret-like content" }),
        expect.objectContaining({ path: "linked.txt", reason: "symlink omitted" })
      ])
    );
  });

  it("omits paths outside the sandbox", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-artifacts-"));
    mkdirSync(join(root, "safe"), { recursive: true });

    const result = collectArtifacts({
      root,
      changedFiles: [{ path: "../escape.txt", status: "modified" }]
    });

    expect(result.artifacts).toEqual([]);
    expect(result.omittedArtifacts).toEqual([
      {
        path: "../escape.txt",
        status: "modified",
        reason: "outside sandbox"
      }
    ]);
  });
});
