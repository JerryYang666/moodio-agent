/**
 * OTP (One-Time Password) utilities
 * Handles OTP generation and verification
 */

import { db } from "@/lib/db";
import { otps } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { siteConfig } from "@/config/site";

/**
 * Generate a numeric OTP based on configured length
 */
export function generateOTP(): string {
  const length = siteConfig.auth.otp.length;
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  const otp = Math.floor(min + Math.random() * (max - min + 1)).toString();
  return otp;
}

/**
 * Create and store an OTP in the database
 */
export async function createOTP(userId: string, code: string): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setMinutes(
    expiresAt.getMinutes() + siteConfig.auth.otp.expiresInMinutes
  );

  await db.insert(otps).values({
    userId,
    code,
    expiresAt,
    isUsed: false,
  });
}

/**
 * Verify an OTP for a user
 * Returns true if valid and marks it as used, false otherwise
 */
export async function verifyOTP(
  userId: string,
  code: string
): Promise<boolean> {
  try {
    // Find valid, unused OTP
    const result = await db
      .select()
      .from(otps)
      .where(
        and(
          eq(otps.userId, userId),
          eq(otps.code, code),
          eq(otps.isUsed, false),
          gt(otps.expiresAt, new Date())
        )
      )
      .limit(1);

    if (result.length === 0) {
      return false;
    }

    // Mark OTP as used
    await db
      .update(otps)
      .set({ isUsed: true })
      .where(eq(otps.id, result[0].id));

    return true;
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return false;
  }
}

/**
 * Clean up expired or used OTPs for a user
 */
export async function cleanupOTPs(userId: string): Promise<void> {
  try {
    await db
      .delete(otps)
      .where(and(eq(otps.userId, userId), eq(otps.isUsed, true)));
  } catch (error) {
    console.error("Error cleaning up OTPs:", error);
  }
}
