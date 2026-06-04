import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { SandboxOptions, SandboxResult } from "./types.js";
import { isInside } from "./file-context.js";

const DEFAULT_MAX_FILES = 600;
const DEFAULT_MAX_BYTES = 30 * 1024 * 1024;

const EXCLUDED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".cache",
  "coverage",
  ".turbo",
  ".vercel",
  ".DS_Store"
]);

export async function createSandbox(options: SandboxOptions): Promise<SandboxResult> {
  const sourceDir = resolve(options.sourceDir);
  const sandboxDir = await mkdtemp(join(tmpdir(), "codex-composer-"));
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const copiedFiles: string[] = [];
  const omittedFiles: string[] = [];
  let copiedBytes = 0;

  const copyFile = (absolute: string, rel: string): boolean => {
    if (copiedFiles.length >= maxFiles) {
      omittedFiles.push(`${rel} (file limit reached)`);
      return false;
    }

    const stat = statSync(absolute);
    if (copiedBytes + stat.size > maxBytes) {
      omittedFiles.push(`${rel} (byte limit reached)`);
      return false;
    }

    const destination = join(sandboxDir, rel);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(absolute, destination, { force: true });
    copiedFiles.push(rel);
    copiedBytes += stat.size;
    return true;
  };

  if (options.files?.length) {
    for (const file of options.files) {
      const absolute = resolve(sourceDir, file);
      const rel = relative(sourceDir, absolute);
      if (!isInside(sourceDir, absolute)) {
        omittedFiles.push(`${file} (outside source dir)`);
        continue;
      }
      if (!existsSync(absolute)) {
        omittedFiles.push(`${file} (missing)`);
        continue;
      }
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute, sourceDir, copyFile, omittedFiles, maxFiles, maxBytes, () => copiedFiles.length, () => copiedBytes);
      } else if (stat.isFile()) {
        copyFile(absolute, rel);
      }
    }
  } else {
    walk(sourceDir, sourceDir, copyFile, omittedFiles, maxFiles, maxBytes, () => copiedFiles.length, () => copiedBytes);
  }

  return {
    sandboxDir,
    copiedFiles,
    omittedFiles,
    copiedBytes
  };
}

function walk(
  dir: string,
  root: string,
  copyFile: (absolute: string, rel: string) => boolean,
  omittedFiles: string[],
  maxFiles: number,
  maxBytes: number,
  fileCount: () => number,
  byteCount: () => number
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_NAMES.has(entry.name)) continue;

    const absolute = join(dir, entry.name);
    const rel = relative(root, absolute);

    if (!absolute.startsWith(`${resolve(root)}${sep}`) && absolute !== resolve(root)) {
      omittedFiles.push(`${rel} (outside source dir)`);
      continue;
    }

    if (entry.isDirectory()) {
      walk(absolute, root, copyFile, omittedFiles, maxFiles, maxBytes, fileCount, byteCount);
      continue;
    }

    if (!entry.isFile()) continue;
    if (fileCount() >= maxFiles || byteCount() >= maxBytes) {
      omittedFiles.push(`${rel} (sandbox budget reached)`);
      continue;
    }
    copyFile(absolute, rel);
  }
}
