/**
 * Next.js Middleware for authentication
 * Handles route protection and automatic token refresh
 * All logic inline for Edge Runtime compatibility
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { siteConfig } from "@/config/site";

/**
 * Check if a path is public (doesn't require authentication)
 */
function isPublicPath(pathname: string): boolean {
  const publicPaths = [
    "/auth/login",
    "/api/auth/request-otp",
    "/api/auth/verify-otp",
    "/api/auth/refresh",
    "/api/auth/me",
  ];

  if (publicPaths.includes(pathname)) {
    return true;
  }

  if (pathname.startsWith("/auth/")) {
    return true;
  }

  return false;
}

/**
 * Get JWT secret as Uint8Array
 */
function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Verify access token from cookie
 */
async function verifyAccessToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret);

    if (!payload.userId || typeof payload.userId !== "string") {
      return null;
    }

    return { userId: payload.userId };
  } catch (error) {
    return null;
  }
}

/**
 * Get access token from request cookies
 */
function getAccessToken(request: NextRequest): string | null {
  return (
    request.cookies.get(siteConfig.auth.accessToken.cookieName)?.value || null
  );
}

/**
 * Get refresh token from request cookies
 */
function getRefreshToken(request: NextRequest): string | null {
  return (
    request.cookies.get(siteConfig.auth.refreshToken.cookieName)?.value || null
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get access token from cookie
  const accessToken = getAccessToken(request);

  // If user is on login page and has valid access token, redirect to home
  if (pathname === "/auth/login" && accessToken) {
    const payload = await verifyAccessToken(accessToken);
    if (payload) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Verify access token if present
  if (accessToken) {
    const payload = await verifyAccessToken(accessToken);
    if (payload) {
      // Valid access token, allow request
      return NextResponse.next();
    }
  }

  // Access token is invalid, expired, or missing - try to refresh
  const refreshToken = getRefreshToken(request);
  const isApiRoute = pathname.startsWith("/api/");

  if (refreshToken) {
    try {
      // Call the refresh API endpoint
      const refreshUrl = new URL("/api/auth/refresh", request.url);
      const refreshResponse = await fetch(refreshUrl.toString(), {
        method: "POST",
        headers: {
          Cookie: `${siteConfig.auth.refreshToken.cookieName}=${refreshToken}`,
        },
      });

      if (refreshResponse.ok) {
        // Refresh succeeded, get the new access token cookie
        const setCookieHeader = refreshResponse.headers.get("set-cookie");

        if (setCookieHeader) {
          // Extract the new access token value to update the request
          const accessTokenName = siteConfig.auth.accessToken.cookieName;
          // Simple regex to find the cookie value: name=value;
          const match = setCookieHeader.match(
            new RegExp(`${accessTokenName}=([^;]+)`)
          );
          const newAccessToken = match ? match[1] : null;
          if (newAccessToken) {
            // Update the request cookies so downstream middleware/handlers see the new token
            request.cookies.set(accessTokenName, newAccessToken);
          }

          // Continue with the request, attaching the new Set-Cookie header to the response
          // so the client (browser) also gets the updated token
          const response = NextResponse.next();
          response.headers.set("set-cookie", setCookieHeader);
          return response;
        }
      }
    } catch (error) {
      console.error("Error refreshing token in middleware:", error);
    }
  }

  // No valid tokens (or refresh failed), redirect to login or return 401
  let response: NextResponse;

  if (isApiRoute) {
    response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    response = NextResponse.redirect(loginUrl);
  }

  // Delete cookies to clean up
  response.cookies.delete(siteConfig.auth.accessToken.cookieName);
  response.cookies.delete(siteConfig.auth.refreshToken.cookieName);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)",
  ],
};
