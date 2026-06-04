import { runCommand } from "./process.js";

export async function initializeGitBaseline(cwd: string): Promise<void> {
  await runCommand("git", ["init"], { cwd });
  await runCommand("git", ["add", "-A"], { cwd });
  await runCommand(
    "git",
    [
      "-c",
      "user.name=Codex Composer",
      "-c",
      "user.email=codex-composer@example.invalid",
      "commit",
      "-m",
      "baseline"
    ],
    { cwd }
  );
}

export async function collectDiff(cwd: string): Promise<string> {
  await runCommand("git", ["add", "-N", "."], { cwd });
  const result = await runCommand("git", ["diff", "--no-ext-diff", "--", "."], { cwd });
  return result.stdout.trim();
}
