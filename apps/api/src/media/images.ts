import sharp from "sharp";
import { LIMITS } from "@stargaze/shared";
import { AppError } from "../lib/errors.js";
import { Semaphore } from "../lib/limiter.js";

const FORMATS = new Map([["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]);
const gate = new Semaphore(2);
sharp.cache(false);

/** Decode by content (not client MIME), enforce format and pixel limits, normalize to metadata-free WebP. */
export function normalizeImage(input: string, output: string) {
  return gate.run(async () => {
    let meta: sharp.Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: LIMITS.maxImagePixels }).metadata();
    } catch {
      throw new AppError(400, "invalid_image", "An attachment is not a readable image.");
    }
    if (!meta.format || !FORMATS.has(meta.format)) {
      throw new AppError(415, "unsupported_media_type", "Images must be JPEG, PNG or WebP (convert HEIC before upload).");
    }
    if (!meta.width || !meta.height || meta.width * meta.height > LIMITS.maxImagePixels) {
      throw new AppError(400, "invalid_image", "Images may be at most 20 megapixels.");
    }
    try {
      const info = await sharp(input, { limitInputPixels: LIMITS.maxImagePixels })
        .rotate()
        .resize({ width: LIMITS.normalizedLongEdge, height: LIMITS.normalizedLongEdge, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(output);
      return { width: info.width, height: info.height, size: info.size, mime: "image/webp" };
    } catch {
      throw new AppError(400, "invalid_image", "An attachment could not be decoded.");
    }
  });
}

/** Moderation derivative: ≤ 1024 px long edge JPEG, base64 for /v1/systemone. */
export function moderationImage(path: string, longEdge: number = LIMITS.moderationLongEdge) {
  return gate.run(async () =>
    (await sharp(path).resize({ width: longEdge, height: longEdge, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer())
      .toString("base64"));
}
