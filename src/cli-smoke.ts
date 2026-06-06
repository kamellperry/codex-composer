#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleAsk, handleHealth, handlePatch } from "./tools.js";

const command = process.argv[2] ?? "health";

if (command === "health") {
  const result = await handleHealth({ cwd: process.cwd(), model: "composer-2.5", live: true });
  console.log(result.content[0].text);
} else if (command === "ask") {
  const result = await handleAsk({
    cwd: process.cwd(),
    prompt: "Reply exactly CODEX_COMPOSER_OK and nothing else.",
    files: [],
    model: "composer-2.5",
    mode: "plan",
    timeoutMs: 120_000,
    keepSandbox: false
  });
  console.log(result.content[0].text);
} else if (command === "ask-design") {
  const result = await handleAsk({
    cwd: process.cwd(),
    prompt: [
      "Give concise UI guidance for a paid consumer app dashboard.",
      "Return three short sections: Principle, Layout, Avoid.",
      "Do not edit files."
    ].join("\n"),
    files: ["README.md"],
    model: "composer-2.5",
    mode: "plan",
    timeoutMs: 120_000,
    keepSandbox: false
  });
  const parsed = JSON.parse(result.content[0].text);
  if (result.isError || parsed.outputUsable === false || !/principle|layout|avoid/i.test(parsed.text ?? "")) {
    console.log(result.content[0].text);
    throw new Error("Composer design smoke did not return usable design guidance.");
  }
  console.log(result.content[0].text);
} else if (command === "patch") {
  const fixture = join(process.cwd(), "test", "fixtures", "simple-repo");
  const before = readFileSync(join(fixture, "README.md"), "utf8");
  const result = await handlePatch({
    cwd: fixture,
    prompt: "Change the README heading to '# Updated Fixture'. Do not change anything else.",
    files: ["README.md"],
    model: "composer-2.5",
    commandPolicy: "advisory-forbid",
    includeArtifacts: true,
    maxArtifactBytes: 256 * 1024,
    timeoutMs: 300_000,
    keepSandbox: false
  });
  const after = readFileSync(join(fixture, "README.md"), "utf8");
  console.log(
    JSON.stringify(
      {
        sourceUnchanged: before === after,
        result: JSON.parse(result.content[0].text)
      },
      null,
      2
    )
  );
} else if (command === "patch-empty") {
  const fixture = mkdtempSync(join(tmpdir(), "codex-composer-empty-smoke-"));
  const result = await handlePatch({
    cwd: fixture,
    prompt: "Create a file named CODEX_COMPOSER_EMPTY_OK.txt containing exactly CODEX_COMPOSER_EMPTY_OK and a trailing newline.",
    files: [],
    model: "composer-2.5",
    commandPolicy: "advisory-forbid",
    includeArtifacts: true,
    maxArtifactBytes: 256 * 1024,
    timeoutMs: 300_000,
    keepSandbox: false
  });
  console.log(
    JSON.stringify(
      {
        sourceUnchanged: !existsSync(join(fixture, "CODEX_COMPOSER_EMPTY_OK.txt")),
        result: JSON.parse(result.content[0].text)
      },
      null,
      2
    )
  );
} else {
  console.error(`Unknown smoke command: ${command}`);
  process.exit(2);
}
