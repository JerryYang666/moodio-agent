/**
 * Classifies raw video generation error messages into user-friendly categories.
 *
 * Fal and other providers return technical error strings that aren't suitable
 * for end users. This module maps them to i18n keys so the UI can display
 * localized, human-readable messages.
 */

export type VideoErrorType =
  | "prompt_violation"
  | "generic_failure";

const CONTENT_VIOLATION_PATTERNS = [
  /\b422\b/,
  /content.?moderat/i,
  /safety.?filter/i,
  /nsfw/i,
  /sensitive.?content/i,
  /violat/i,
  /blocked/i,
  /prohibited/i,
  /inappropriate/i,
  /not.?allowed/i,
  /policy/i,
  /content.?filter/i,
  /审核/,
  /违规/,
  /敏感/,
  /合规/,
];

/**
 * Classify a raw error string into a user-friendly error type.
 */
export function classifyVideoError(rawError: string | null | undefined): VideoErrorType {
  if (!rawError) return "generic_failure";

  for (const pattern of CONTENT_VIOLATION_PATTERNS) {
    if (pattern.test(rawError)) {
      return "prompt_violation";
    }
  }

  return "generic_failure";
}

/**
 * Returns the i18n key (under the "video" namespace) for a given error type.
 */
export function getErrorMessageKey(errorType: VideoErrorType): string {
  switch (errorType) {
    case "prompt_violation":
      return "errorPromptViolation";
    case "generic_failure":
    default:
      return "errorGenericFailure";
  }
}

/**
 * Convenience: classify a raw error and return the i18n key directly.
 */
export function getUserFriendlyErrorKey(rawError: string | null | undefined): string {
  return getErrorMessageKey(classifyVideoError(rawError));
}
