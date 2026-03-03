import sharp from "sharp";

const MAX_IMAGE_SIZE_BYTES = 19 * 1024 * 1024; // 19 MB

const QUALITY_STEPS = [92, 85, 78] as const;

/**
 * If the image buffer exceeds 19 MB, progressively compress it to WebP
 * at decreasing quality levels until it fits. Returns the original buffer
 * untouched when it's already under the limit.
 */
export async function compressImageIfNeeded(
  imageBuffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string }> {
  if (imageBuffer.length <= MAX_IMAGE_SIZE_BYTES) {
    return { buffer: imageBuffer, contentType };
  }

  const originalSizeMB = (imageBuffer.length / (1024 * 1024)).toFixed(2);
  console.log(
    `[Image Compress] Image size ${originalSizeMB} MB exceeds limit, compressing...`
  );

  for (const quality of QUALITY_STEPS) {
    const compressed = await sharp(imageBuffer)
      .webp({ quality, effort: 4 })
      .toBuffer();

    const compressedSizeMB = (compressed.length / (1024 * 1024)).toFixed(2);
    console.log(
      `[Image Compress] WebP quality=${quality} → ${compressedSizeMB} MB`
    );

    if (compressed.length <= MAX_IMAGE_SIZE_BYTES) {
      return { buffer: compressed, contentType: "image/webp" };
    }
  }

  // Last resort: already went through all quality steps, return the best we got
  const fallback = await sharp(imageBuffer)
    .webp({ quality: QUALITY_STEPS[QUALITY_STEPS.length - 1], effort: 6 })
    .toBuffer();

  const fallbackSizeMB = (fallback.length / (1024 * 1024)).toFixed(2);
  console.warn(
    `[Image Compress] Could not get below limit. Final size: ${fallbackSizeMB} MB`
  );

  return { buffer: fallback, contentType: "image/webp" };
}
