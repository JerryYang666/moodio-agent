import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { userCredits, creditTransactions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

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

    // Check if user has a credits record, if not create one
    const existingCredits = await db
      .select()
      .from(userCredits)
      .where(eq(userCredits.userId, userId))
      .limit(1);

    if (existingCredits.length === 0) {
      // Create credits record for user
      await db.insert(userCredits).values({
        userId,
        balance: 0,
      });
    }

    // Insert transaction and update balance atomically
    await db.transaction(async (tx) => {
      // Insert transaction record
      await tx.insert(creditTransactions).values({
        userId,
        amount: amountNum,
        type: "admin_grant",
        description: description || null,
        performedBy: payload.userId,
      });

      // Update balance
      await tx
        .update(userCredits)
        .set({
          balance: sql`${userCredits.balance} + ${amountNum}`,
          updatedAt: new Date(),
        })
        .where(eq(userCredits.userId, userId));
    });

    // Get updated balance
    const [updatedCredits] = await db
      .select()
      .from(userCredits)
      .where(eq(userCredits.userId, userId))
      .limit(1);

    return NextResponse.json({
      success: true,
      balance: updatedCredits.balance,
    });
  } catch (error) {
    console.error("Error adjusting credits:", error);
    return NextResponse.json(
      { error: "Failed to adjust credits" },
      { status: 500 }
    );
  }
}
