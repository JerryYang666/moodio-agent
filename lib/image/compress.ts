import sharp from "sharp";

const MAX_IMAGE_SIZE_BYTES = 19 * 1024 * 1024; // 19 MB

/**
 * If the image buffer exceeds 19 MB, compress it to WebP.
 * First tries lossless WebP (pixel-perfect, typically 3-6x smaller than PNG).
 * Falls back to high-quality lossy WebP only if lossless still exceeds the limit.
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

  // Step 1: Try lossless WebP (identical quality, much smaller than PNG)
  const lossless = await sharp(imageBuffer)
    .webp({ lossless: true })
    .toBuffer();

  const losslessSizeMB = (lossless.length / (1024 * 1024)).toFixed(2);
  console.log(
    `[Image Compress] WebP lossless → ${losslessSizeMB} MB`
  );

  if (lossless.length <= MAX_IMAGE_SIZE_BYTES) {
    return { buffer: lossless, contentType: "image/webp" };
  }

  // Step 2: Lossless still too large — use near-lossless (quality 97-95)
  for (const quality of [97, 95, 90] as const) {
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

  // Last resort: quality 85
  const fallback = await sharp(imageBuffer)
    .webp({ quality: 85, effort: 6 })
    .toBuffer();

  const fallbackSizeMB = (fallback.length / (1024 * 1024)).toFixed(2);
  console.warn(
    `[Image Compress] Could not get below limit with lossless. Final size: ${fallbackSizeMB} MB`
  );

  return { buffer: fallback, contentType: "image/webp" };
}
