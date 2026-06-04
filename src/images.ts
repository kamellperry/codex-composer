import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import type { ImageInput } from "./types.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

export function toSdkImages(images: ImageInput[] = []) {
  return images.map((image) => {
    const stat = statSync(image.path);
    if (!stat.isFile()) {
      throw new Error(`Image is not a file: ${image.path}`);
    }
    if (stat.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes: ${image.path}`);
    }

    const mimeType = image.mimeType ?? MIME_BY_EXT[extname(image.path).toLowerCase()];
    if (!mimeType) {
      throw new Error(`Unsupported image extension: ${image.path}`);
    }

    return {
      data: readFileSync(image.path).toString("base64"),
      mimeType
    };
  });
}
