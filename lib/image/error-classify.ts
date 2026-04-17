/**
 * Classifies raw image generation error messages into user-friendly reason codes.
 *
 * Image providers (KIE, Google, fal, etc.) return technical error strings that
 * aren't suitable for end users. This module maps them to stable reason codes
 * that the UI can then translate via i18n.
 *
 * These reason codes are stored on the `reason` field of generated image parts
 * (agent_image / direct_image / agent_video_suggest), matching the existing
 * "INSUFFICIENT_CREDITS" convention.
 */

export type ImageErrorReason =
  | "INSUFFICIENT_CREDITS"
  | "CONTENT_POLICY_VIOLATION"
  | "PUBLIC_FIGURE_BLOCKED"
  | "GENERATION_FAILED";

const PUBLIC_FIGURE_PATTERNS = [
  /prominent public figure/i,
  /public figure/i,
  /celebrit/i,
  /名人/,
  /公众人物/,
];

const CONTENT_POLICY_PATTERNS = [
  /prohibited use policy/i,
  /filtered out/i,
  /content.?polic/i,
  /content.?moderat/i,
  /safety.?filter/i,
  /safety.?system/i,
  /nsfw/i,
  /sensitive.?content/i,
  /violat/i,
  /blocked/i,
  /prohibited/i,
  /inappropriate/i,
  /not.?allowed/i,
  /content.?filter/i,
  /flagged/i,
  /no images found in ai response/i,
  /审核/,
  /违规/,
  /敏感/,
  /合规/,
];

/**
 * Classify a raw image error string into a stable reason code.
 * Returns "GENERATION_FAILED" as a fallback.
 */
export function classifyImageError(
  rawError: string | null | undefined
): ImageErrorReason {
  if (!rawError) return "GENERATION_FAILED";

  for (const pattern of PUBLIC_FIGURE_PATTERNS) {
    if (pattern.test(rawError)) return "PUBLIC_FIGURE_BLOCKED";
  }

  for (const pattern of CONTENT_POLICY_PATTERNS) {
    if (pattern.test(rawError)) return "CONTENT_POLICY_VIOLATION";
  }

  return "GENERATION_FAILED";
}
