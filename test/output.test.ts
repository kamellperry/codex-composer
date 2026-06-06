import { describe, expect, it } from "vitest";
import { extractComposerOutput } from "../src/output.js";

describe("Composer output extraction", () => {
  it("returns the final assistant answer from the SDK conversation when the run result is wrapper-only", () => {
    const result = extractComposerOutput({
      runResultText: "I'll synthesize the app context into a concrete visual plan Codex can execute.",
      conversation: [
        {
          type: "agentConversationTurn",
          turn: {
            steps: [
              {
                type: "assistantMessage",
                message: {
                  text: "Use a compact native dashboard with one status line, one account row, and a recent-check timeline."
                }
              }
            ]
          }
        }
      ]
    });

    expect(result.usable).toBe(true);
    expect(result.source).toBe("conversation-assistant");
    expect(result.text).toBe(
      "Use a compact native dashboard with one status line, one account row, and a recent-check timeline."
    );
    expect(result.text).not.toContain("synthesize");
  });

  it("returns createPlan plan text when Composer hides the advisory answer in a plan tool call", () => {
    const result = extractComposerOutput({
      runResultText: "Five sections, grounded in the Neo codebase and your Landing A / Dashboard B preferences.",
      conversation: [
        {
          role: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "Five sections, grounded in the Neo codebase and your Landing A / Dashboard B preferences.\n\n[REDACTED]"
              },
              {
                type: "tool_use",
                name: "CreatePlan",
                input: {
                  name: "Rune Mockup Design Brief",
                  overview: "Design guidance for Rune image mockups.",
                  plan: "# Rune Mockup Design Brief\n\n## 1 Principle\n\nOne job, one screen. Every pixel answers whether rewards are being collected."
                }
              }
            ]
          }
        }
      ]
    });

    expect(result.usable).toBe(true);
    expect(result.source).toBe("conversation-createPlan");
    expect(result.text).toContain("# Rune Mockup Design Brief");
    expect(result.text).toContain("One job, one screen.");
    expect(result.text).not.toContain("Five sections, grounded");
  });

  it("marks wrapper-only output unusable when no useful conversation answer exists", () => {
    const result = extractComposerOutput({
      runResultText: "The request is design guidance for Rune mockups, not code — I'll synthesize the app context.",
      conversation: [
        {
          type: "agentConversationTurn",
          turn: {
            steps: [
              {
                type: "thinkingMessage",
                message: {
                  text: "Private reasoning that must not be returned."
                }
              }
            ]
          }
        }
      ]
    });

    expect(result.usable).toBe(false);
    expect(result.rejectedReason).toContain("wrapper");
    expect(result.text).toContain("synthesize");
    expect(result.candidates).toContainEqual(
      expect.objectContaining({
        source: "run-result",
        usable: false,
        reason: "wrapper-only"
      })
    );
  });

  it("keeps a useful short direct answer instead of over-filtering it", () => {
    const result = extractComposerOutput({
      runResultText: "CODEX_COMPOSER_OK"
    });

    expect(result.usable).toBe(true);
    expect(result.source).toBe("run-result");
    expect(result.text).toBe("CODEX_COMPOSER_OK");
  });
});
