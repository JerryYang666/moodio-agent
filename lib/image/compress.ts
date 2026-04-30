import sharp from "sharp";

const QUALITY_STEPS = [99, 97, 95] as const;

/**
 * Compress an image to WebP if it exceeds the given target size.
 * Starts at quality 99 with smartSubsample for virtually pixel-perfect
 * output. Falls back to lower quality steps only if needed.
 * Avoids lossless/nearLossless encoding which is too slow and
 * memory-intensive for serverless runtimes.
 *
 * When `forceReencode` is true and the image is already under the target
 * size, it is still re-encoded as a plain SDR JPEG. This strips Apple/Google
 * HDR gain maps (MPF + ISO 21496-1 auxiliary images) that gpt-image-2
 * rejects with "Invalid image file or mode".
 */
export async function compressImageIfNeeded(
  imageBuffer: Buffer,
  contentType: string,
  targetSizeBytes: number,
  forceReencode = false
): Promise<{ buffer: Buffer; contentType: string }> {
  if (imageBuffer.length <= targetSizeBytes) {
    if (!forceReencode) return { buffer: imageBuffer, contentType };
    const flat = await sharp(imageBuffer).jpeg({ quality: 95 }).toBuffer();
    return { buffer: flat, contentType: "image/jpeg" };
  }

  const originalSizeMB = (imageBuffer.length / (1024 * 1024)).toFixed(2);
  const targetSizeMB = (targetSizeBytes / (1024 * 1024)).toFixed(0);
  console.log(
    `[Image Compress] Image size ${originalSizeMB} MB exceeds ${targetSizeMB} MB limit, compressing...`
  );

  for (const quality of QUALITY_STEPS) {
    const compressed = await sharp(imageBuffer)
      .webp({ quality, effort: 2, smartSubsample: true })
      .toBuffer();

    const compressedSizeMB = (compressed.length / (1024 * 1024)).toFixed(2);
    console.log(
      `[Image Compress] WebP quality=${quality} → ${compressedSizeMB} MB`
    );

    if (compressed.length <= targetSizeBytes) {
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
