/**
 * JWT utilities using jose library
 * Handles access token generation and verification
 */

import { SignJWT, jwtVerify } from "jose";
import { siteConfig } from "@/config/site";

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

export interface TeamMembership {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
}

export interface AccessTokenPayload {
  userId: string;
  email?: string;
  roles?: string[];
  firstName?: string;
  lastName?: string;
  teams?: TeamMembership[];
}

/**
 * Generate an access token (JWT) for a user
 */
export async function generateAccessToken(
  userId: string,
  email?: string,
  roles?: string[],
  firstName?: string,
  lastName?: string,
  teams?: TeamMembership[]
): Promise<string> {
  const secret = getJWTSecret();

  const payload: Record<string, any> = { userId };

  if (email) payload.email = email;
  if (roles) payload.roles = roles;
  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;
  if (teams && teams.length > 0) payload.teams = teams;

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(siteConfig.auth.accessToken.expiresIn)
    .sign(secret);

  return token;
}

/**
 * Verify and decode an access token
 * Returns the payload if valid, null if invalid or expired
 */
export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret, {
      clockTolerance: siteConfig.auth.clockSkewSeconds,
    });

    if (!payload.userId || typeof payload.userId !== "string") {
      return null;
    }

    const result: AccessTokenPayload = { userId: payload.userId };
    
    if (payload.email && typeof payload.email === "string") {
      result.email = payload.email;
    }
    
    if (Array.isArray(payload.roles)) {
      result.roles = payload.roles as string[];
    }
    
    if (payload.firstName && typeof payload.firstName === "string") {
      result.firstName = payload.firstName;
    }
    
    if (payload.lastName && typeof payload.lastName === "string") {
      result.lastName = payload.lastName;
    }

    if (Array.isArray(payload.teams)) {
      result.teams = payload.teams as TeamMembership[];
    }

    return result;
  } catch (error) {
    // Token is invalid or expired
    return null;
  }
}

// REALTIME_INTERNAL_AUDIENCE gates /api/realtime/authorize. Tokens without
// this audience (e.g. the browser access-token cookie) cannot authenticate
// that endpoint — only the Go relay, which holds JWT_ACCESS_SECRET, can mint
// matching bearers. Keep this string in sync with realtime/auth.go.
export const REALTIME_INTERNAL_AUDIENCE = "realtime-internal";

export interface InternalTokenPayload {
  userId: string;
}

/**
 * Verify a bearer minted by the Go relay for /api/realtime/authorize.
 * Requires aud=REALTIME_INTERNAL_AUDIENCE. Returns null on any failure.
 */
export async function verifyInternalToken(
  token: string
): Promise<InternalTokenPayload | null> {
  try {
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret, {
      audience: REALTIME_INTERNAL_AUDIENCE,
      clockTolerance: siteConfig.auth.clockSkewSeconds,
    });
    if (!payload.userId || typeof payload.userId !== "string") {
      return null;
    }
    return { userId: payload.userId };
  } catch (err) {
    // Log the reason so the relay can be debugged from the Next.js side.
    // Expected safe: jose messages don't contain secret material.
    console.error("[realtime/authorize] verifyInternalToken failed:", err);
    return null;
  }
}
