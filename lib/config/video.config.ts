/**
 * Video content configuration
 *
 * S3 content prefix - must match backend S3_CONTENT_PREFIX in config/constants.py
 */
export const S3_CONTENT_PREFIX = "public-videos" as const;

/**
 * Construct CloudFront URL for retrieval content.
 * 
 * Supports both retrieval storage key families:
 * - public-videos/...webm
 * - public-stills/...webp
 */
export function getContentUrl(storageKey: string): string {
  let cloudfrontDomain = process.env.NEXT_PUBLIC_CLOUDFRONT_URL;

  if (!cloudfrontDomain) {
    console.error('NEXT_PUBLIC_CLOUDFRONT_URL environment variable is not set');
    return '';
  }

  // Ensure the domain has a protocol (https://)
  if (!cloudfrontDomain.startsWith('http://') && !cloudfrontDomain.startsWith('https://')) {
    cloudfrontDomain = `https://${cloudfrontDomain}`;
  }

  // Remove leading slash if present
  const cleanKey = storageKey.startsWith('/') ? storageKey.slice(1) : storageKey;

  // Construct full URL - storage_key already includes the bucket prefix.
  return `${cloudfrontDomain}/${cleanKey}`;
}

/**
 * Backward-compatible alias for legacy call sites.
 */
export function getVideoUrl(storageKey: string): string {
  return getContentUrl(storageKey);
}
