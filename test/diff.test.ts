import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectChangedFiles, collectDiff, initializeGitBaseline, parsePorcelainStatus } from "../src/diff.js";

describe("diff helpers", () => {
  it("captures sandbox changes as a diff", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-diff-"));
    writeFileSync(join(root, "hello.txt"), "before\n");

    await initializeGitBaseline(root);
    writeFileSync(join(root, "hello.txt"), "after\n");

    const diff = await collectDiff(root);

    expect(diff).toContain("-before");
    expect(diff).toContain("+after");
  });

  it("supports empty baselines and new file diffs", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-empty-diff-"));

    await initializeGitBaseline(root);
    writeFileSync(join(root, "created.txt"), "created\n");

    const diff = await collectDiff(root);
    const changedFiles = await collectChangedFiles(root);

    expect(diff).toContain("created.txt");
    expect(diff).toContain("+created");
    expect(changedFiles).toContainEqual({ path: "created.txt", status: "added" });
  });

  it("detects changed paths with spaces, unicode, deletes, and renames", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-status-"));
    writeFileSync(join(root, "space name.txt"), "before\n");
    writeFileSync(join(root, "unicodé.txt"), "before\n");
    writeFileSync(join(root, "delete-me.txt"), "before\n");
    writeFileSync(join(root, "old-name.txt"), "before\n");
    await initializeGitBaseline(root);

    writeFileSync(join(root, "space name.txt"), "after\n");
    writeFileSync(join(root, "unicodé.txt"), "after\n");
    rmSync(join(root, "delete-me.txt"));
    renameSync(join(root, "old-name.txt"), join(root, "new name.txt"));

    const changedFiles = await collectChangedFiles(root);
    const paths = changedFiles.map((file) => file.path);

    expect(paths).toContain("space name.txt");
    expect(paths).toContain("unicodé.txt");
    expect(paths).toContain("delete-me.txt");
    expect(paths).toContain("old-name.txt");
    expect(paths).toContain("new name.txt");
  });

  it("parses porcelain rename records with nul separators", () => {
    const parsed = parsePorcelainStatus("R  new name.txt\0old name.txt\0");

    expect(parsed).toEqual([
      {
        path: "new name.txt",
        originalPath: "old name.txt",
        status: "renamed"
      }
    ]);
  });
});
