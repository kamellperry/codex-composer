import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  agentSchema,
  askSchema,
  handleAskWithRunner,
  handleAgentWithRunner,
  handlePatchWithRunner,
  handleUiReviewWithRunner,
  patchSchema,
  uiReviewSchema
} from "../src/tools.js";
import type { ComposerRunner } from "../src/sandboxed-run.js";

describe("tool schemas", () => {
  it("applies patch defaults", () => {
    const parsed = z.object(patchSchema).parse({
      cwd: "/tmp",
      prompt: "change it"
    });

    expect(parsed.commandPolicy).toBe("advisory-forbid");
    expect(parsed.includeArtifacts).toBe(true);
    expect(parsed.timeoutMs).toBe(300_000);
    expect(parsed.keepSandbox).toBe(false);
  });

  it("applies ask defaults for timeout and sandbox cleanup", () => {
    const parsed = z.object(askSchema).parse({
      cwd: "/tmp",
      prompt: "review this"
    });

    expect(parsed.timeoutMs).toBe(120_000);
    expect(parsed.keepSandbox).toBe(false);
  });

  it("applies UI review timeout defaults", () => {
    const parsed = z.object(uiReviewSchema).parse({
      prompt: "review this",
      images: [{ path: "/tmp/screen.png" }]
    });

    expect(parsed.timeoutMs).toBe(120_000);
  });

  it("applies agent defaults", () => {
    const parsed = z.object(agentSchema).parse({
      cwd: "/tmp",
      objective: "build it"
    });

    expect(parsed.commandPolicy).toBe("advisory-forbid");
    expect(parsed.includeArtifacts).toBe(true);
    expect(parsed.timeoutMs).toBe(600_000);
    expect(parsed.keepSandbox).toBe(false);
  });
});

describe("advisory tool handlers", () => {
  it("composer_ask returns useful advisory text and can keep its sandbox for debugging", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-ask-"));
    const runner: ComposerRunner = async (options) => {
      return {
        text: "Use one status line, one account row, and one recent-check timeline.",
        outputSource: "conversation-assistant",
        outputUsable: true,
        outputCandidates: [{ source: "conversation-assistant", length: 66, usable: true }],
        runId: "run_ask",
        agentId: "agent_ask",
        status: "finished",
        model: options.model,
        timedOut: false,
        cancelled: false
      };
    };

    const response = await handleAskWithRunner(
      {
        cwd: root,
        prompt: "Give dashboard direction",
        files: [],
        model: "composer-2.5",
        mode: "plan",
        timeoutMs: 120_000,
        keepSandbox: true
      },
      runner
    );
    const value = JSON.parse(response.content[0].text);

    expect(response.isError).toBe(false);
    expect(value.text).toContain("one status line");
    expect(value.outputSource).toBe("conversation-assistant");
    expect(value.sandbox.kept).toBe(true);
    expect(existsSync(value.sandbox.path)).toBe(true);

    rmSync(value.sandbox.path, { recursive: true, force: true });
  });

  it("composer_ask marks wrapper-only Composer output as an error instead of a successful answer", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-ask-wrapper-"));
    const runner: ComposerRunner = async (options) => {
      return {
        text: "The request is design guidance for Rune mockups, not code — I'll synthesize the app context.",
        outputUsable: false,
        outputRejectedReason: "Composer finished but only produced wrapper, redacted, or empty output.",
        outputCandidates: [{ source: "run-result", length: 88, usable: false, reason: "wrapper-only" }],
        runId: "run_wrapper",
        agentId: "agent_wrapper",
        status: "finished",
        model: options.model,
        timedOut: false,
        cancelled: false
      };
    };

    const response = await handleAskWithRunner(
      {
        cwd: root,
        prompt: "Give dashboard direction",
        files: [],
        model: "composer-2.5",
        mode: "plan",
        timeoutMs: 120_000,
        keepSandbox: false
      },
      runner
    );
    const value = JSON.parse(response.content[0].text);

    expect(response.isError).toBe(true);
    expect(value.outputRejectedReason).toContain("wrapper");
    expect(value.outputCandidates).toContainEqual(
      expect.objectContaining({
        source: "run-result",
        usable: false,
        reason: "wrapper-only"
      })
    );
  });

  it("composer_ui_review marks unusable Composer output as an error", async () => {
    const runner: ComposerRunner = async (options) => {
      return {
        text: "",
        outputUsable: false,
        outputRejectedReason: "Composer finished without producing assistant output.",
        outputCandidates: [],
        runId: "run_ui",
        agentId: "agent_ui",
        status: "finished",
        model: options.model,
        timedOut: false,
        cancelled: false
      };
    };

    const response = await handleUiReviewWithRunner(
      {
        prompt: "Review this UI",
        files: [],
        images: [{ path: "/tmp/screen.png" }],
        model: "composer-2.5",
        timeoutMs: 120_000
      },
      runner
    );
    const value = JSON.parse(response.content[0].text);

    expect(response.isError).toBe(true);
    expect(value.outputRejectedReason).toContain("without producing assistant output");
  });
});

describe("sandboxed tool handlers", () => {
  it("composer_patch leaves the source unchanged and returns diff, artifacts, and evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-tool-"));
    writeFileSync(join(root, "README.md"), "# Before\n");
    const before = readFileSync(join(root, "README.md"), "utf8");

    const runner: ComposerRunner = async (options) => {
      writeFileSync(join(options.cwd, "README.md"), "# After\n");
      return {
        text: "updated README",
        runId: "run_patch",
        agentId: "agent_patch",
        status: "finished",
        model: options.model,
        durationMs: 10,
        timedOut: false,
        cancelled: false,
        evidence: {
          events: [{ type: "tool_call", name: "edit", status: "completed" }],
          policyViolations: []
        }
      };
    };

    const response = await handlePatchWithRunner(
      {
        cwd: root,
        prompt: "Update the heading",
        files: ["README.md"],
        model: "composer-2.5",
        commandPolicy: "advisory-forbid",
        includeArtifacts: true,
        maxArtifactBytes: 256 * 1024,
        timeoutMs: 300_000,
        keepSandbox: false
      },
      runner
    );

    const value = JSON.parse(response.content[0].text);

    expect(readFileSync(join(root, "README.md"), "utf8")).toBe(before);
    expect(value.changed).toBe(true);
    expect(value.diff).toContain("# After");
    expect(value.artifacts).toEqual([
      {
        path: "README.md",
        status: "modified",
        content: "# After\n",
        sizeBytes: 8
      }
    ]);
    expect(value.evidence.events).toContainEqual({ type: "tool_call", name: "edit", status: "completed" });
  });

  it("composer_agent can create multiple files without touching the source", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-tool-empty-"));

    const runner: ComposerRunner = async (options) => {
      writeFileSync(join(options.cwd, "index.html"), "<main>OK</main>\n");
      writeFileSync(join(options.cwd, "style.css"), "main { color: red; }\n");
      return {
        text: "created files",
        runId: "run_agent",
        agentId: "agent_agent",
        status: "finished",
        model: options.model,
        durationMs: 20,
        timedOut: false,
        cancelled: false,
        evidence: {
          events: [{ type: "tool_call", name: "write", status: "completed" }],
          policyViolations: ["test policy violation"]
        }
      };
    };

    const response = await handleAgentWithRunner(
      {
        cwd: root,
        objective: "Create a tiny static page",
        files: [],
        model: "composer-2.5",
        commandPolicy: "advisory-forbid",
        includeArtifacts: true,
        maxArtifactBytes: 256 * 1024,
        timeoutMs: 600_000,
        keepSandbox: false
      },
      runner
    );

    const value = JSON.parse(response.content[0].text);

    expect(existsSync(join(root, "index.html"))).toBe(false);
    expect(value.changedFiles.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining(["index.html", "style.css"])
    );
    expect(value.artifacts.map((artifact: { path: string }) => artifact.path)).toEqual(
      expect.arrayContaining(["index.html", "style.css"])
    );
    expect(value.evidence.policyViolations).toEqual(["test policy violation"]);
  });

  it("returns timeout and sandbox retention evidence from a timed-out run result", async () => {
    const root = mkdtempSync(join(tmpdir(), "codex-composer-tool-timeout-"));

    const runner: ComposerRunner = async (options) => {
      writeFileSync(join(options.cwd, "partial.txt"), "partial\n");
      return {
        text: "",
        runId: "run_timeout",
        agentId: "agent_timeout",
        status: "cancelled",
        model: options.model,
        durationMs: 100,
        timedOut: true,
        cancelled: true,
        evidence: {
          events: [],
          policyViolations: []
        }
      };
    };

    const response = await handlePatchWithRunner(
      {
        cwd: root,
        prompt: "Create a partial file",
        files: [],
        model: "composer-2.5",
        commandPolicy: "advisory-forbid",
        includeArtifacts: true,
        maxArtifactBytes: 256 * 1024,
        timeoutMs: 1,
        keepSandbox: true
      },
      runner
    );

    const value = JSON.parse(response.content[0].text);

    expect(value.timedOut).toBe(true);
    expect(value.cancelled).toBe(true);
    expect(value.evidence.partialResultsCollected).toBe(true);
    expect(value.sandbox.kept).toBe(true);
    expect(value.sandbox.path).toBeTruthy();
    expect(existsSync(value.sandbox.path)).toBe(true);
  });
});
