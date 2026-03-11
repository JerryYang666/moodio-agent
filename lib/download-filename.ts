const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const TRAILING_DOT_OR_SPACE = /[. ]+$/g;
const EXTENSION_SUFFIX = /\.[^./\\]+$/;
const MAX_FILENAME_BYTES = 180;

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
  const candidate = (value ?? "").trim().replace(EXTENSION_SUFFIX, "");
  const cleaned = candidate
    .replace(INVALID_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .replace(TRAILING_DOT_OR_SPACE, "")
    .trim();

  const withFallback = cleaned || fallback;
  const truncated = truncateUtf8(withFallback, MAX_FILENAME_BYTES)
    .replace(TRAILING_DOT_OR_SPACE, "")
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
