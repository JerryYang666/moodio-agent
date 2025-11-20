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

export interface AccessTokenPayload {
  userId: string;
  email?: string;
  roles?: string[];
  firstName?: string;
  lastName?: string;
}

/**
 * Generate an access token (JWT) for a user
 */
export async function generateAccessToken(
  userId: string,
  email?: string,
  roles?: string[],
  firstName?: string,
  lastName?: string
): Promise<string> {
  const secret = getJWTSecret();

  const payload: Record<string, any> = { userId };

  if (email) payload.email = email;
  if (roles) payload.roles = roles;
  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;

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
    const { payload } = await jwtVerify(token, secret);

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

    return result;
  } catch (error) {
    // Token is invalid or expired
    return null;
  }
}
