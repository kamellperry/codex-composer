import { runCommand } from "./process.js";
import type { ChangedFile, ChangedFileStatus } from "./types.js";

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
      "--allow-empty",
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

export async function collectChangedFiles(cwd: string): Promise<ChangedFile[]> {
  await runCommand("git", ["add", "-N", "."], { cwd });
  const result = await runCommand("git", ["status", "--porcelain=v1", "-z"], { cwd });
  return parsePorcelainStatus(result.stdout);
}

export function parsePorcelainStatus(output: string): ChangedFile[] {
  const entries = output.split("\0");
  const changedFiles: ChangedFile[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;

    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) continue;

    const status = statusFromPorcelain(xy);
    if (xy[0] === "R" || xy[0] === "C") {
      const originalPath = entries[index + 1];
      index += 1;
      changedFiles.push({ path, originalPath, status });
      continue;
    }

    changedFiles.push({ path, status });
  }

  return changedFiles;
}

function statusFromPorcelain(xy: string): ChangedFileStatus {
  const [indexStatus, worktreeStatus] = xy;
  if (indexStatus === "R") return "renamed";
  if (indexStatus === "C") return "copied";
  if (indexStatus === "A" || worktreeStatus === "A") return "added";
  if (indexStatus === "D" || worktreeStatus === "D") return "deleted";
  if (indexStatus === "M" || worktreeStatus === "M") return "modified";
  if (xy === "??") return "untracked";
  return "unknown";
}
