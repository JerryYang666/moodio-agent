import { getCdnBaseUrl } from "@/lib/cdn";

/**
 * Video content configuration
 *
 * S3 content prefix - must match backend S3_CONTENT_PREFIX in config/constants.py
 */
export const S3_CONTENT_PREFIX = "public-videos" as const;

/**
 * Construct CDN URL for retrieval content.
 * 
 * Supports both retrieval storage key families:
 * - public-videos/...webm
 * - public-stills/...webp
 *
 * @param cnMode When true, resolves to the China CDN domain.
 */
export function getContentUrl(storageKey: string, cnMode: boolean = false): string {
  const base = getCdnBaseUrl(cnMode);

  if (!base) {
    console.error("CDN URL is not configured");
    return "";
  }

  const cleanKey = storageKey.startsWith("/") ? storageKey.slice(1) : storageKey;
  return `${base}/${cleanKey}`;
}

/**
 * Backward-compatible alias for legacy call sites.
 */
export function getVideoUrl(storageKey: string, cnMode: boolean = false): string {
  return getContentUrl(storageKey, cnMode);
}
