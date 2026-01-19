import { getSignedCookies } from "@aws-sdk/cloudfront-signer";
import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import {
  CLOUDFRONT_COOKIE_NAMES,
  getCloudFrontCookieOptions,
} from "@/lib/auth/cloudfront-cookie-config";

const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const CLOUDFRONT_KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID;
const CLOUDFRONT_PRIVATE_KEY = process.env.CLOUDFRONT_PRIVATE_KEY?.replace(
  /\\n/g,
  "\n"
);

export function setCloudFrontCookies(
  response: NextResponse,
  expirationSeconds = siteConfig.cloudfront.signedCookieExpirationSeconds
): NextResponse {
  if (
    !CLOUDFRONT_DOMAIN ||
    !CLOUDFRONT_KEY_PAIR_ID ||
    !CLOUDFRONT_PRIVATE_KEY
  ) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, skipping signed cookies"
    );
    return response;
  }

  const policyExpirationSeconds =
    expirationSeconds + siteConfig.cloudfront.signedCookieClockSkewSeconds;
  const dateLessThan = new Date(Date.now() + policyExpirationSeconds * 1000);
  const resourceUrl = `https://${CLOUDFRONT_DOMAIN}/*`;
  const policyDocument = JSON.stringify({
    Statement: [
      {
        Resource: resourceUrl,
        Condition: {
          DateLessThan: {
            "AWS:EpochTime": Math.floor(dateLessThan.getTime() / 1000),
          },
        },
      },
    ],
  });

  const signedCookies = getSignedCookies({
    policy: policyDocument,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    privateKey: CLOUDFRONT_PRIVATE_KEY,
  });

  const policy = signedCookies[CLOUDFRONT_COOKIE_NAMES.policy];
  const signature = signedCookies[CLOUDFRONT_COOKIE_NAMES.signature];
  const keyPairId = signedCookies[CLOUDFRONT_COOKIE_NAMES.keyPairId];

  if (!policy || !signature || !keyPairId) {
    console.warn("[CloudFront] Failed to generate signed cookies");
    return response;
  }

  const cookieOptions = getCloudFrontCookieOptions(expirationSeconds);

  response.cookies.set(CLOUDFRONT_COOKIE_NAMES.policy, policy, cookieOptions);
  response.cookies.set(
    CLOUDFRONT_COOKIE_NAMES.signature,
    signature,
    cookieOptions
  );
  response.cookies.set(
    CLOUDFRONT_COOKIE_NAMES.keyPairId,
    keyPairId,
    cookieOptions
  );

  return response;
}
