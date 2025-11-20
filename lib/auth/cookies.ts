/**
 * Cookie utilities for managing authentication tokens
 * Handles HTTP-only cookies for access and refresh tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { siteConfig } from "@/config/site";

/**
 * Cookie options for secure HTTP-only cookies
 */
function getCookieOptions(maxAge: number) {
  return {
    ...siteConfig.auth.cookie,
    maxAge,
  };
}

/**
 * Set authentication cookies in a NextResponse
 */
export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string
): NextResponse {
  response.cookies.set(
    siteConfig.auth.accessToken.cookieName,
    accessToken,
    getCookieOptions(siteConfig.auth.accessToken.maxAge)
  );

  response.cookies.set(
    siteConfig.auth.refreshToken.cookieName,
    refreshToken,
    getCookieOptions(siteConfig.auth.refreshToken.maxAge)
  );

  return response;
}

/**
 * Set only the access token cookie (for refresh operations)
 */
export function setAccessTokenCookie(
  response: NextResponse,
  accessToken: string
): NextResponse {
  response.cookies.set(
    siteConfig.auth.accessToken.cookieName,
    accessToken,
    getCookieOptions(siteConfig.auth.accessToken.maxAge)
  );

  return response;
}

/**
 * Clear authentication cookies
 */
export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete(siteConfig.auth.accessToken.cookieName);
  response.cookies.delete(siteConfig.auth.refreshToken.cookieName);

  return response;
}

/**
 * Get tokens from request cookies
 */
export function getTokensFromCookies(request: NextRequest): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  const accessToken =
    request.cookies.get(siteConfig.auth.accessToken.cookieName)?.value || null;
  const refreshToken =
    request.cookies.get(siteConfig.auth.refreshToken.cookieName)?.value || null;

  return { accessToken, refreshToken };
}

/**
 * Get access token from request
 * Checks cookies first, then tries to parse from Set-Cookie header if provided
 */
export function getAccessToken(
  request: NextRequest,
  additionalHeaders?: Headers | any
): string | null {
  // 1. Try standard cookie first
  const cookieToken = request.cookies.get(
    siteConfig.auth.accessToken.cookieName
  )?.value;
  if (cookieToken) return cookieToken;

  // 2. Fallback: Check Set-Cookie header (useful when middleware just refreshed the token)
  const setCookieHeader =
    request.headers.get("set-cookie") || additionalHeaders?.get("set-cookie");

  if (setCookieHeader) {
    const match = setCookieHeader.match(
      new RegExp(`${siteConfig.auth.accessToken.cookieName}=([^;]+)`)
    );
    if (match) return match[1];
  }

  return null;
}

/**
 * Get refresh token from request
 */
export function getRefreshToken(request: NextRequest): string | null {
  return (
    request.cookies.get(siteConfig.auth.refreshToken.cookieName)?.value || null
  );
}
