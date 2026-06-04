import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<CommandResult> {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    maxBuffer: 20 * 1024 * 1024
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}
