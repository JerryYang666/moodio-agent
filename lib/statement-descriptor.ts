const STATEMENT_DESCRIPTOR_PREFIX = "MOODIO";
const SEPARATOR_LENGTH = 2; // "* " between prefix and suffix
const MAX_TOTAL_LENGTH = 22;
const MAX_SUFFIX_LENGTH =
  MAX_TOTAL_LENGTH - STATEMENT_DESCRIPTOR_PREFIX.length - SEPARATOR_LENGTH;

/**
 * Sanitize a product name into a valid Stripe statement descriptor suffix.
 *
 * Rules enforced:
 * - Strips "moodio" (redundant with prefix)
 * - Latin characters only (strips everything else)
 * - No forbidden chars: < > \ ' " *
 * - At least one letter
 * - Trimmed to fit within 22-char total (prefix + "* " + suffix)
 */
export function sanitizeStatementDescriptorSuffix(name: string): string {
  const cleaned = name
    .replace(/\bmoodio\b/gi, "")
    .replace(/[<>\\'""*＊]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const truncated = cleaned.slice(0, MAX_SUFFIX_LENGTH).trim();

  if (truncated.length === 0 || !/[a-zA-Z]/.test(truncated)) {
    return "Purchase";
  }

  return truncated;
}

/**
 * Build the full statement descriptor as it would appear on a card statement.
 */
export function formatStatementDescriptorPreview(name: string): string {
  return `${STATEMENT_DESCRIPTOR_PREFIX}* ${sanitizeStatementDescriptorSuffix(name)}`;
}
