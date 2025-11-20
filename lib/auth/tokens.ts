/**
 * Refresh token utilities
 * Handles UUID-based refresh tokens stored in the database
 */

import { db } from "@/lib/db";
import { refreshTokens, users } from "@/lib/db/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { siteConfig } from "@/config/site";
import { generateAccessToken } from "./jwt";

/**
 * Result type for refresh operations
 */
export interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

/**
 * Generate a new refresh token (two UUIDs concatenated without dashes)
 */
export function generateRefreshToken(): string {
  const uuid1 = uuidv4().replace(/-/g, "");
  const uuid2 = uuidv4().replace(/-/g, "");
  return `${uuid1}${uuid2}`;
}

/**
 * Create and store a refresh token in the database
 */
export async function createRefreshToken(
  userId: string,
  token: string
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + siteConfig.auth.refreshToken.expiresInDays
  );

  await db.insert(refreshTokens).values({
    userId,
    token,
    expiresAt,
  });
}

/**
 * Verify a refresh token exists in the database and is not expired
 * Returns the userId if valid, null otherwise
 */
export async function verifyRefreshToken(
  token: string
): Promise<string | null> {
  try {
    const result = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.token, token),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0].userId;
  } catch (error) {
    console.error("Error verifying refresh token:", error);
    return null;
  }
}

/**
 * Delete a refresh token from the database
 */
export async function deleteRefreshToken(token: string): Promise<void> {
  try {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  } catch (error) {
    console.error("Error deleting refresh token:", error);
  }
}

/**
 * Delete all refresh tokens for a user
 */
export async function deleteAllUserRefreshTokens(
  userId: string
): Promise<void> {
  try {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  } catch (error) {
    console.error("Error deleting user refresh tokens:", error);
  }
}

/**
 * Refresh access token using a refresh token
 * Returns new tokens or error
 *
 * This is the shared logic used by both the middleware and the refresh API endpoint
 * Note: Refresh tokens are single-use - old token is marked to expire shortly
 */
export async function refreshAccessToken(
  refreshTokenValue: string
): Promise<RefreshResult> {
  try {
    // Find refresh token in database
    const [tokenRecord] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.token, refreshTokenValue),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    // If refresh token is invalid or expired
    if (!tokenRecord) {
      return {
        success: false,
        error: "Invalid or expired refresh token",
      };
    }

    // Get user information
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, tokenRecord.userId))
      .limit(1);

    if (!user) {
      return {
        success: false,
        error: "User not found",
      };
    }

    // Capture original expiration for the NEW token
    const originalExpiresAt = tokenRecord.expiresAt;

    // Update old refresh token expiration (grace period) instead of deleting
    const gracePeriodExpiresAt = new Date();
    gracePeriodExpiresAt.setSeconds(
      gracePeriodExpiresAt.getSeconds() + siteConfig.auth.refreshToken.gracePeriodSeconds
    );

    await db
      .update(refreshTokens)
      .set({ expiresAt: gracePeriodExpiresAt })
      .where(eq(refreshTokens.id, tokenRecord.id));

    // Generate new tokens
    const newAccessToken = await generateAccessToken(
      user.id,
      user.email,
      user.roles as string[],
      user.firstName || undefined,
      user.lastName || undefined
    );

    const newRefreshToken = generateRefreshToken();

    // Store new refresh token in database with inherited expiration
    await db.insert(refreshTokens).values({
      userId: user.id,
      token: newRefreshToken,
      expiresAt: originalExpiresAt,
    });

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    console.error("Error refreshing token:", error);
    return {
      success: false,
      error: "Failed to refresh token",
    };
  }
}

/**
 * Delete all expired refresh tokens from the database
 */
export async function deleteExpiredRefreshTokens(): Promise<void> {
  try {
    await db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, new Date()));
  } catch (error) {
    console.error("Error deleting expired refresh tokens:", error);
    throw error;
  }
}
