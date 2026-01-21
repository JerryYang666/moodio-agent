import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { userCredits } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { grantCredits, deductCredits } from "@/lib/credits";

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, amount, description } = body;

    if (!userId || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: "userId and amount are required" },
        { status: 400 }
      );
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum === 0) {
      return NextResponse.json(
        { error: "Amount must be a non-zero number" },
        { status: 400 }
      );
    }

    // Use shared credit functions
    if (amountNum > 0) {
      await grantCredits(
        userId,
        amountNum,
        "admin_grant",
        description || null,
        payload.userId
      );
    } else {
      // Deducting (amountNum is negative)
      await deductCredits(
        userId,
        Math.abs(amountNum),
        "admin_grant",
        description || null
      );
    }

    // Get updated balance
    const [updatedCredits] = await db
      .select()
      .from(userCredits)
      .where(eq(userCredits.userId, userId))
      .limit(1);

    return NextResponse.json({
      success: true,
      balance: updatedCredits?.balance || 0,
    });
  } catch (error: any) {
    console.error("Error adjusting credits:", error);
    
    // Handle insufficient credits error
    if (error.name === "InsufficientCreditsError") {
      return NextResponse.json(
        { error: "Insufficient credits for deduction" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to adjust credits" },
      { status: 500 }
    );
  }
}
