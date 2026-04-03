export type MediaType = "shot" | "multishot" | "image";

const DEFAULT_MEDIA_TYPE: MediaType = "shot";

export function normalizeMediaType(contentType?: string | null): MediaType {
  if (contentType === "shot" || contentType === "multishot" || contentType === "image") {
    return contentType;
  }
  return DEFAULT_MEDIA_TYPE;
}

export function isImageContentType(contentType?: string | null): boolean {
  return normalizeMediaType(contentType) === "image";
}
