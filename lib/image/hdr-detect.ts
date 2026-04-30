/**
 * Detect JPEGs that carry an HDR gain map (Apple Ultra HDR / ISO 21496-1 /
 * Google Ultra HDR). These files look like a normal JPEG to most tools but
 * OpenAI's gpt-image-2 endpoint rejects them with:
 *   "Invalid image file or mode for image N, please check your image file"
 *
 * Pillow (which OpenAI uses server-side) does not yet understand the MPF
 * auxiliary stream or the ISO 21496-1 segment and fails with a mode error.
 *
 * Upstream tracking: https://github.com/python-pillow/Pillow/issues/8036
 *
 * We sniff only the first 128 KB because all HDR-related APP segments sit
 * near the file head (before the SOS marker).
 */

const HEAD_BYTES = 128 * 1024;

const HDR_SIGNATURES: readonly string[] = [
  "urn:iso:std:iso:ts:21496", // ISO 21496-1 gain map (iOS 18+, Android Ultra HDR)
  "HDRGainMap",               // Apple HDR gain map XMP namespace
  "hdr-gain-map",             // Adobe / Google Ultra HDR XMP namespace
];

function bytesContainSignature(bytes: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(bytes);
  return HDR_SIGNATURES.some((sig) => text.includes(sig));
}

/**
 * Returns true if the file is a JPEG that embeds an HDR gain map.
 * Cheap: reads the first 128 KB, no decoding.
 */
export async function isHdrGainMapJpeg(file: File): Promise<boolean> {
  const looksLikeJpeg =
    file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  if (!looksLikeJpeg) return false;

  const head = await file.slice(0, HEAD_BYTES).arrayBuffer();
  return bytesContainSignature(new Uint8Array(head));
}

/**
 * Server-side equivalent for a Buffer. Only scans the head.
 */
export function bufferIsHdrGainMapJpeg(buf: Buffer): boolean {
  return bytesContainSignature(buf.subarray(0, HEAD_BYTES));
}
