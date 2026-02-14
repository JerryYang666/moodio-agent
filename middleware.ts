/**
 * Next.js Middleware for authentication
 * Handles route protection and automatic token refresh
 * All logic inline for Edge Runtime compatibility
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { siteConfig } from "@/config/site";
import { clearCloudFrontCookies } from "@/lib/auth/cloudfront-cookie-config";

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
    "/api/auth/passkey/login/options",
    "/api/auth/passkey/login/verify",
    "/api/video/webhook",
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
    const { payload } = await jwtVerify(token, secret, {
      clockTolerance: siteConfig.auth.clockSkewSeconds,
    });

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

/**
 * Check if the request is a browser prefetch or Next.js prefetch
 */
function isPrefetch(request: NextRequest): boolean {
  const headers = request.headers;
  const purpose = headers.get("purpose");
  const secPurpose = headers.get("sec-purpose");
  const xPurpose = headers.get("x-purpose");
  const xMoz = headers.get("x-moz");
  const xMiddlewarePrefetch = headers.get("x-middleware-prefetch");

  return (
    (purpose !== null && purpose.includes("prefetch")) ||
    (secPurpose !== null && (secPurpose.includes("prefetch") || secPurpose.includes("prerender"))) ||
    (xPurpose !== null && xPurpose.includes("prefetch")) ||
    (xMoz !== null && xMoz.includes("prefetch")) ||
    xMiddlewarePrefetch === "1"
  );
}

/**
 * Attempt to refresh the session using the refresh token
 * Returns the set-cookie header and new access token if successful
 */
async function refreshSession(request: NextRequest): Promise<{ setCookie: string | null; newAccessToken: string | null }> {
  const refreshToken = getRefreshToken(request);
  if (!refreshToken) {
    return { setCookie: null, newAccessToken: null };
  }

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
        
        return { setCookie: setCookieHeader, newAccessToken };
      }
    }
  } catch (error) {
    console.error("Error refreshing token in middleware:", error);
  }

  return { setCookie: null, newAccessToken: null };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for maintenance mode
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";
  if (isMaintenanceMode && pathname !== "/maintenance") {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  } else if (isMaintenanceMode && pathname === "/maintenance") {
    return NextResponse.next();
  }

  // 1. Verify existing access token
  const accessToken = getAccessToken(request);
  const isValidAccessToken = accessToken ? await verifyAccessToken(accessToken) : null;

  // 2. Handle Login Page logic
  // If user is on login page:
  // - If valid access token -> Redirect to home
  // - If invalid access token -> Try to refresh. If success -> Redirect to home. If fail -> Stay on login
  if (pathname === "/auth/login") {
    if (isValidAccessToken) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // No valid access token, try to refresh
    // Do not refresh on prefetch
    if (!isPrefetch(request)) {
      const { setCookie } = await refreshSession(request);
      if (setCookie) {
        const response = NextResponse.redirect(new URL("/", request.url));
        response.headers.set("set-cookie", setCookie);
        return response;
      }
    }
    
    // If refresh failed or no refresh token, allow to proceed to login page
    return NextResponse.next();
  }

  // 3. Allow other public paths
  if (isPublicPath(pathname)) {
    // Special case: /api/auth/me - attempt token refresh if refresh token exists
    // This handles the common scenario where /me is the first endpoint called
    // after the access token expires
    if (pathname === "/api/auth/me" && !isValidAccessToken) {
      const refreshToken = getRefreshToken(request);
      
      // Only attempt refresh if we have a refresh token and it's not a prefetch
      if (refreshToken && !isPrefetch(request)) {
        const { setCookie, newAccessToken } = await refreshSession(request);
        
        if (setCookie && newAccessToken) {
          // Refresh succeeded - update request cookies and set response header
          request.cookies.set(siteConfig.auth.accessToken.cookieName, newAccessToken);
          const response = NextResponse.next();
          response.headers.set("set-cookie", setCookie);
          return response;
        }
        
        // Refresh failed - continue anyway since this is a public path
      }
    }
    
    return NextResponse.next();
  }

  // 4. Protected Paths - Valid Access Token
  if (isValidAccessToken) {
    return NextResponse.next();
  }

  // 5. Protected Paths - Invalid/Missing Access Token -> Try Refresh
  const isApiRoute = pathname.startsWith("/api/");

  // Check for prefetch headers - DO NOT refresh tokens on prefetch
  if (isPrefetch(request)) {
    return new NextResponse(null, { 
      status: 204,
      headers: {
        "Cache-Control": "no-store, must-revalidate"
      }
    });
  }

  const { setCookie, newAccessToken } = await refreshSession(request);

  if (setCookie && newAccessToken) {
    // Update the request cookies so downstream middleware/handlers see the new token
    request.cookies.set(siteConfig.auth.accessToken.cookieName, newAccessToken);

    // Continue with the request, attaching the new Set-Cookie header to the response
    const response = NextResponse.next();
    response.headers.set("set-cookie", setCookie);
    return response;
  }

  // 6. No valid tokens (or refresh failed), redirect to login or return 401
  let response: NextResponse;

  if (isApiRoute) {
    response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    response = NextResponse.redirect(loginUrl);
  }

  // Delete cookies to clean up (must include domain/path to match domain-scoped cookies)
  const cookieDeleteOpts = { path: siteConfig.auth.cookie.path, ...(siteConfig.auth.cookie.domain ? { domain: siteConfig.auth.cookie.domain } : {}) };
  response.cookies.delete({ name: siteConfig.auth.accessToken.cookieName, ...cookieDeleteOpts });
  response.cookies.delete({ name: siteConfig.auth.refreshToken.cookieName, ...cookieDeleteOpts });
  clearCloudFrontCookies(response);

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
