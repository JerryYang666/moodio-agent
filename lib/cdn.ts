const CN_CDN_DOMAIN = process.env.CN_CDN_DOMAIN;
const CN_CDN_URL = process.env.NEXT_PUBLIC_CN_CDN_URL;

/**
 * Resolve the CDN hostname (e.g. "cdn-cn.moodio.art" or "cdn0.moodio.art").
 * Used by server-side code (s3.ts) that builds URLs from a bare domain.
 */
export function getCdnDomain(cnMode: boolean = false): string {
  if (cnMode && CN_CDN_DOMAIN) return CN_CDN_DOMAIN;
  return process.env.CLOUDFRONT_DOMAIN || "";
}

/**
 * Resolve the full CDN base URL (e.g. "https://cdn-cn.moodio.art").
 * Used by shared/client code (video.config.ts) that needs a full origin.
 */
export function getCdnBaseUrl(cnMode: boolean = false): string {
  if (cnMode && CN_CDN_URL) return CN_CDN_URL;
  let domain =
    process.env.NEXT_PUBLIC_CLOUDFRONT_URL ||
    process.env.CLOUDFRONT_DOMAIN ||
    "";
  if (domain && !domain.startsWith("http")) {
    domain = `https://${domain}`;
  }
  return domain;
}
