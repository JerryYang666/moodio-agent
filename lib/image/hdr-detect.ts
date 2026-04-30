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
 * iPhones emit HDR gain maps in two different layouts:
 *   1. iOS 18+ Ultra HDR — the `urn:iso:std:iso:ts:21496` marker sits in an
 *      APP segment near the file head.
 *   2. Older Apple HDR — MPF appends a second auxiliary JPEG at the END of
 *      the file and the `HDRGainMap` / `apdi` XMP lives inside that tail
 *      image's own header.
 * We therefore sniff both ends.
 */

const HEAD_BYTES = 128 * 1024;
const TAIL_BYTES = 512 * 1024;

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
 * Cheap: reads up to 128 KB from the head and 512 KB from the tail.
 */
export async function isHdrGainMapJpeg(file: File): Promise<boolean> {
  const looksLikeJpeg =
    file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  if (!looksLikeJpeg) return false;

  const head = await file.slice(0, HEAD_BYTES).arrayBuffer();
  if (bytesContainSignature(new Uint8Array(head))) return true;

  if (file.size > HEAD_BYTES) {
    const tailStart = Math.max(HEAD_BYTES, file.size - TAIL_BYTES);
    const tail = await file.slice(tailStart, file.size).arrayBuffer();
    if (bytesContainSignature(new Uint8Array(tail))) return true;
  }

  return false;
}

/**
 * Server-side equivalent for a Buffer. Scans the whole buffer since it is
 * already in memory — this also catches Apple's tail-appended gain maps.
 */
export function bufferIsHdrGainMapJpeg(buf: Buffer): boolean {
  return bytesContainSignature(buf);
}
