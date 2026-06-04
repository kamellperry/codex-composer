import { readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const MAX_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024;

export interface FileContextOptions {
  cwd: string;
  files?: string[];
}

export interface FileContextResult {
  block: string;
  includedFiles: string[];
  omittedFiles: string[];
}

export function buildFileContext(options: FileContextOptions): FileContextResult {
  if (!options.files?.length) {
    return {
      block: "",
      includedFiles: [],
      omittedFiles: []
    };
  }

  const root = resolve(options.cwd);
  const includedFiles: string[] = [];
  const omittedFiles: string[] = [];
  const chunks: string[] = [];
  let totalBytes = 0;

  for (const file of options.files) {
    const absolute = resolve(root, file);
    if (!isInside(root, absolute)) {
      omittedFiles.push(`${file} (outside cwd)`);
      continue;
    }

    try {
      const stat = statSync(absolute);
      if (!stat.isFile()) {
        omittedFiles.push(`${file} (not a file)`);
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        omittedFiles.push(`${file} (larger than ${MAX_FILE_BYTES} bytes)`);
        continue;
      }
      if (totalBytes + stat.size > MAX_TOTAL_BYTES) {
        omittedFiles.push(`${file} (context budget reached)`);
        continue;
      }

      const text = readFileSync(absolute, "utf8");
      const rel = relative(root, absolute);
      chunks.push(`--- ${rel} ---\n${text}`);
      includedFiles.push(rel);
      totalBytes += stat.size;
    } catch (error) {
      omittedFiles.push(`${file} (${error instanceof Error ? error.message : "read failed"})`);
    }
  }

  return {
    block: chunks.length ? `\n\nSelected file context:\n\n${chunks.join("\n\n")}` : "",
    includedFiles,
    omittedFiles
  };
}

export function isInside(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)
  );
}
