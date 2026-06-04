import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/redact.js";

describe("redactSecrets", () => {
  it("redacts explicit secrets and common key assignments", () => {
    const output = redactSecrets(
      "CURSOR_API_KEY=cursor_secret_123456789 extra cursor_secret_123456789",
      ["cursor_secret_123456789"]
    );

    expect(output).not.toContain("cursor_secret_123456789");
    expect(output).toContain("[redacted]");
  });
});
