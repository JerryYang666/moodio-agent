import sharp from "sharp";

const MAX_IMAGE_SIZE_BYTES = 6 * 1024 * 1024; // 6 MB

const QUALITY_STEPS = [99, 97, 95] as const;

/**
 * If the image buffer exceeds 6 MB, convert to high-quality WebP.
 * Starts at quality 99 with smartSubsample for virtually pixel-perfect
 * output. Falls back to lower quality steps only if needed.
 * Avoids lossless/nearLossless encoding which is too slow and
 * memory-intensive for serverless runtimes.
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
      .webp({ quality, effort: 2, smartSubsample: true })
      .toBuffer();

    const compressedSizeMB = (compressed.length / (1024 * 1024)).toFixed(2);
    console.log(
      `[Image Compress] WebP quality=${quality} → ${compressedSizeMB} MB`
    );

    if (compressed.length <= MAX_IMAGE_SIZE_BYTES) {
      return { buffer: compressed, contentType: "image/webp" };
    }
  }

  const fallback = await sharp(imageBuffer)
    .webp({ quality: 85, effort: 4, smartSubsample: true })
    .toBuffer();

  const fallbackSizeMB = (fallback.length / (1024 * 1024)).toFixed(2);
  console.warn(
    `[Image Compress] Final fallback size: ${fallbackSizeMB} MB`
  );

  return { buffer: fallback, contentType: "image/webp" };
}
