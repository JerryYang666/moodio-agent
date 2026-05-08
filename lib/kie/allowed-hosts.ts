/**
 * Allowlist of hosts the server is willing to fetch (or hand to a third
 * party that will fetch on our behalf, like KIE's upload-by-URL endpoint).
 * Defends against SSRF in any code path that takes a URL from
 * (potentially) user-supplied input and either fetches it directly or
 * forwards it to a service that does.
 *
 * Allowed:
 *   - Our CDN: process.env.CLOUDFRONT_DOMAIN (signed CloudFront URLs)
 *   - Our CN CDN: process.env.CN_CDN_DOMAIN (signed CN CloudFront URLs)
 *   - KIE storage: any host ending in `.redpandaai.co` (or exact
 *     `redpandaai.co`). Strict suffix match so `redpandaai.co.evil.com`
 *     does not pass.
 *
 * Anything else (including loopback, RFC1918, link-local 169.254.0.0/16,
 * raw IPs, and unrelated public domains) is rejected.
 */

const KIE_HOST_SUFFIX = ".redpandaai.co";
const KIE_HOST_EXACT = "redpandaai.co";

function getAllowedCdnHosts(): string[] {
  const out: string[] = [];
  const cdn = process.env.CLOUDFRONT_DOMAIN;
  if (cdn) out.push(cdn.toLowerCase());
  const cn = process.env.CN_CDN_DOMAIN;
  if (cn) out.push(cn.toLowerCase());
  return out;
}

/**
 * Returns true iff `url` parses as a valid HTTP(S) URL whose host is in
 * the allowlist. Returns false for malformed URLs, non-HTTP schemes
 * (file://, gopher://, ftp://, …), or disallowed hosts.
 */
export function isAllowedFetchHost(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;

  if (host === KIE_HOST_EXACT || host.endsWith(KIE_HOST_SUFFIX)) {
    return true;
  }
  for (const allowed of getAllowedCdnHosts()) {
    if (host === allowed) return true;
  }
  return false;
}

/**
 * Throws if `url` is not in the allowlist. Use at the entry of any
 * function that fetches a URL or passes it to a third party that will.
 */
export function assertAllowedFetchHost(url: string): void {
  if (!isAllowedFetchHost(url)) {
    throw new Error(
      `Refusing to fetch URL outside the allowlist: only Moodio CDN and KIE storage hosts are permitted`
    );
  }
}
