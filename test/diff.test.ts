import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectDiff, initializeGitBaseline } from "../src/diff.js";

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
});
