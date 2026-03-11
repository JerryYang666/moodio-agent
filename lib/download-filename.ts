const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const MAX_BASENAME_INPUT_LENGTH = 2000;
const MAX_FILENAME_BYTES = 180;

function stripTrailingDotOrSpace(value: string): string {
  let end = value.length;
  while (end > 0) {
    const char = value[end - 1];
    if (char === "." || char === " ") {
      end -= 1;
      continue;
    }
    break;
  }

  return end === value.length ? value : value.slice(0, end);
}

function collapseWhitespace(value: string): string {
  let result = "";
  let previousWasWhitespace = false;

  for (const char of value) {
    const isWhitespace = char.trim().length === 0;
    if (isWhitespace) {
      if (!previousWasWhitespace && result.length > 0) {
        result += " ";
      }
      previousWasWhitespace = true;
      continue;
    }

    result += char;
    previousWasWhitespace = false;
  }

  return result;
}

function stripExtensionSuffix(value: string): string {
  const slashIndex = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  const dotIndex = value.lastIndexOf(".");

  if (dotIndex <= slashIndex || dotIndex <= 0 || dotIndex === value.length - 1) {
    return value;
  }

  return value.slice(0, dotIndex);
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) {
    return value;
  }

  let end = value.length;
  while (end > 0 && encoder.encode(value.slice(0, end)).length > maxBytes) {
    end -= 1;
  }

  return value.slice(0, end);
}

export function normalizeDownloadBasename(
  value: string | null | undefined,
  fallback: string
): string {
  const raw = (value ?? "").slice(0, MAX_BASENAME_INPUT_LENGTH);
  const candidate = stripExtensionSuffix(raw.trim());
  const cleaned = candidate
    .replace(INVALID_FILENAME_CHARS, "")
    .trim();
  const normalizedWhitespace = collapseWhitespace(cleaned);
  const withoutTrailingChars = stripTrailingDotOrSpace(normalizedWhitespace)
    .trim();

  const withFallback = withoutTrailingChars || fallback;
  const truncated = stripTrailingDotOrSpace(
    truncateUtf8(withFallback, MAX_FILENAME_BYTES)
  )
    .trim();

  return truncated || fallback;
}

export function buildDownloadFilename(
  basename: string,
  extension: string
): string {
  const normalizedExtension = extension.startsWith(".")
    ? extension
    : `.${extension}`;
  const hasExtension = basename
    .toLowerCase()
    .endsWith(normalizedExtension.toLowerCase());

  return hasExtension ? basename : `${basename}${normalizedExtension}`;
}

function toAsciiFallbackFilename(value: string, fallback: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\\"]/g, "")
    .replace(/[;\r\n]/g, "")
    .trim();

  return ascii || fallback;
}

function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function buildAttachmentContentDisposition(filename: string): string {
  const asciiFallback = toAsciiFallbackFilename(filename, "download");
  const utf8Filename = encodeRfc5987Value(filename);

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Filename}`;
}
