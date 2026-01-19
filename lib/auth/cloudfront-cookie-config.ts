import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";

export const CLOUDFRONT_COOKIE_NAMES = {
  policy: "CloudFront-Policy",
  signature: "CloudFront-Signature",
  keyPairId: "CloudFront-Key-Pair-Id",
} as const;

function getCloudFrontCookieBaseOptions() {
  const options = {
    ...siteConfig.auth.cookie,
  };
  const cookieDomain = siteConfig.cloudfront.cookieDomain;

  if (cookieDomain) {
    return {
      ...options,
      domain: cookieDomain,
    };
  }

  return options;
}

export function getCloudFrontCookieOptions(maxAge: number) {
  return {
    ...getCloudFrontCookieBaseOptions(),
    maxAge,
  };
}

export function clearCloudFrontCookies(response: NextResponse): NextResponse {
  const options = getCloudFrontCookieBaseOptions();

  response.cookies.delete({ name: CLOUDFRONT_COOKIE_NAMES.policy, ...options });
  response.cookies.delete({
    name: CLOUDFRONT_COOKIE_NAMES.signature,
    ...options,
  });
  response.cookies.delete({
    name: CLOUDFRONT_COOKIE_NAMES.keyPairId,
    ...options,
  });

  return response;
}
