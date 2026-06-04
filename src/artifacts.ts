import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isInside } from "./file-context.js";
import { containsSecretLikeContent } from "./redact.js";
import type { ChangedFile, FileArtifact, OmittedArtifact } from "./types.js";

const DEFAULT_MAX_ARTIFACT_BYTES = 256 * 1024;

export function collectArtifacts(options: {
  root: string;
  changedFiles: ChangedFile[];
  maxArtifactBytes?: number;
}): { artifacts: FileArtifact[]; omittedArtifacts: OmittedArtifact[] } {
  const root = realpathSync(resolve(options.root));
  const maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
  const artifacts: FileArtifact[] = [];
  const omittedArtifacts: OmittedArtifact[] = [];

  for (const changedFile of options.changedFiles) {
    const artifact = readArtifact({
      root,
      changedFile,
      maxArtifactBytes
    });

    if ("artifact" in artifact) {
      artifacts.push(artifact.artifact);
    } else {
      omittedArtifacts.push(artifact.omitted);
    }
  }

  return { artifacts, omittedArtifacts };
}

function readArtifact(options: {
  root: string;
  changedFile: ChangedFile;
  maxArtifactBytes: number;
}): { artifact: FileArtifact } | { omitted: OmittedArtifact } {
  const { root, changedFile, maxArtifactBytes } = options;
  const absolute = resolve(root, changedFile.path);

  const omit = (reason: string): { omitted: OmittedArtifact } => ({
    omitted: {
      path: changedFile.path,
      status: changedFile.status,
      reason
    }
  });

  if (!isInside(root, absolute)) return omit("outside sandbox");
  if (changedFile.status === "deleted") return omit("deleted");
  if (!existsSync(absolute)) return omit("missing");

  const linkStat = lstatSync(absolute);
  if (linkStat.isSymbolicLink()) return omit("symlink omitted");
  if (!linkStat.isFile()) return omit("not a regular file");

  const realPath = realpathSync(absolute);
  if (!isInside(root, realPath)) return omit("symlink escape");

  const stat = statSync(absolute);
  if (stat.size > maxArtifactBytes) return omit("oversized");

  const buffer = readFileSync(absolute);
  if (isBinary(buffer)) return omit("binary");

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return omit("binary");
  }

  if (containsSecretLikeContent(content)) return omit("secret-like content");

  return {
    artifact: {
      path: changedFile.path,
      status: changedFile.status,
      content,
      sizeBytes: stat.size
    }
  };
}

function isBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}
