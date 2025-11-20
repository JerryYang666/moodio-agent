/**
 * POST /api/auth/request-otp
 * Request an OTP code to be sent via email
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateOTP, createOTP } from "@/lib/auth/otp";
import { sendOTPEmail } from "@/lib/auth/email";
import { waitUntil } from "@vercel/functions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate email
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if user exists, create if new
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    let userId: string;

    if (user.length === 0) {
      // Create new user
      const newUser = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          roles: ["new_user"],
        })
        .returning();

      userId = newUser[0].id;
    } else {
      userId = user[0].id;
    }

    // Generate and save OTP
    const otpCode = generateOTP();
    await createOTP(userId, otpCode);

    // Send OTP email
    const firstName = user.length > 0 ? user[0].firstName : undefined;
    waitUntil(sendOTPEmail(email, otpCode, firstName || undefined));

    return NextResponse.json({
      success: true,
      message: "OTP sent to your email",
    });
  } catch (error) {
    console.error("Error in request-otp:", error);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}
