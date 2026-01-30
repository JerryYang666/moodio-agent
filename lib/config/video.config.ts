/**
 * Video content configuration
 *
 * S3 content prefix - must match backend S3_CONTENT_PREFIX in config/constants.py
 */
export const S3_CONTENT_PREFIX = "public-videos" as const;

/**
 * Construct CloudFront URL for video content
 * 
 * @param storageKey - Full storage key from backend (e.g., "public-videos/a3/video_001.webm")
 * @returns Full CloudFront URL (e.g., "https://d123abc.cloudfront.net/public-videos/a3/video_001.webm")
 */
export function getVideoUrl(storageKey: string): string {
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

  // Construct full URL - storage_key already includes the bucket prefix (e.g., "public-videos/")
  return `${cloudfrontDomain}/${cleanKey}`;
}
