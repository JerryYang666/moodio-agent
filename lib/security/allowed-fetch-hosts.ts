/**
 * Single source of truth for the allowlist of hosts the server is willing
 * to send HTTP requests to. Used by every code path that fetches a URL
 * (or hands one to a third party that will fetch on our behalf, like
 * KIE's upload-by-URL endpoint).
 *
 * Defends against SSRF: any path that takes a URL from user-supplied
 * input must validate it against this allowlist before letting it reach
 * `fetch()` — directly or transitively.
 *
 * Allowed:
 *   - Our CDN: process.env.CLOUDFRONT_DOMAIN (signed CloudFront URLs)
 *   - Our CN CDN: process.env.CN_CDN_DOMAIN
 *   - Third-party media providers we trust (Fal, KIE, aiquickdraw,
 *     googleapis, volces). Each entry matches the exact host OR any
 *     subdomain via strict suffix match — `redpandaai.co.evil.com` does
 *     NOT pass.
 *
 * Anything else (loopback, RFC1918, link-local 169.254.0.0/16, raw IPs,
 * unrelated public domains, non-https schemes) is rejected.
 *
 * Add a new host here and every subsystem (KIE pipeline, S3 download
 * helpers, route-level validators) picks it up automatically.
 */

/**
 * Static list of third-party media hosts we trust. Each entry matches
 * the exact host OR any subdomain (`endsWith("." + host)`).
 *
 * Keep this list small and precise — every entry is an SSRF surface.
 */
const STATIC_ALLOWED_HOSTS: readonly string[] = [
  // Fal AI (image / video / audio generation)
  "fal.ai",
  "fal.media",
  "rest.alpha.fal.ai",
  "v3.fal.media",
  // KIE / Red Panda AI
  "redpandaai.co",
  "kieai.redpandaai.co",
  "tempfile.redpandaai.co",
  // KIE upstream temp file storage (sora-2 etc.)
  "aiquickdraw.com",
  "tempfile.aiquickdraw.com",
  "file.aiquickdraw.com",
  // Google Cloud Storage (used by some Google-side providers)
  "storage.googleapis.com",
  // ByteDance / Volcengine (Seedream / Seedance)
  "volces.com",
];

function getOwnCdnHosts(): string[] {
  const out: string[] = [];
  const cdn = process.env.CLOUDFRONT_DOMAIN;
  if (cdn) out.push(cdn.toLowerCase());
  const cn = process.env.CN_CDN_DOMAIN;
  if (cn) out.push(cn.toLowerCase());
  return out;
}

/**
 * Returns true iff `url` parses as a valid HTTPS URL whose host is
 * either our own CDN or in the static third-party allowlist (exact or
 * subdomain match).
 *
 * Returns false for malformed URLs, non-HTTPS schemes, or disallowed
 * hosts.
 */
export function isAllowedFetchHost(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (!host) return false;

  for (const own of getOwnCdnHosts()) {
    if (host === own) return true;
  }
  for (const allowed of STATIC_ALLOWED_HOSTS) {
    if (host === allowed || host.endsWith("." + allowed)) return true;
  }
  return false;
}

/**
 * Throws if `url` is not in the allowlist. Use at the entry of any
 * function that fetches a URL or passes it to a third party that will.
 */
export function assertAllowedFetchHost(url: string): void {
  if (!isAllowedFetchHost(url)) {
    let host = "unknown";
    try {
      host = new URL(url).hostname;
    } catch {}
    throw new Error(`Refusing to fetch URL — host '${host}' is not allowlisted`);
  }
}

/**
 * Backward-compatible alias for callers that historically imported
 * `validateDownloadUrl` from `@/lib/storage/s3`. Behaves identically
 * to `assertAllowedFetchHost`.
 */
export function validateDownloadUrl(url: string): void {
  assertAllowedFetchHost(url);
}
