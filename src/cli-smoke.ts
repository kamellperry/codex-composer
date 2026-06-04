#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    mode: "plan"
  });
  console.log(result.content[0].text);
} else if (command === "patch") {
  const fixture = join(process.cwd(), "test", "fixtures", "simple-repo");
  const before = readFileSync(join(fixture, "README.md"), "utf8");
  const result = await handlePatch({
    cwd: fixture,
    prompt: "Change the README heading to '# Updated Fixture'. Do not change anything else.",
    files: ["README.md"],
    model: "composer-2.5"
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
} else {
  console.error(`Unknown smoke command: ${command}`);
  process.exit(2);
}
