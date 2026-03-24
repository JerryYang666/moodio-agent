import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { userActiveAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { AccountType } from "@/lib/credits";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [row] = await db
      .select()
      .from(userActiveAccounts)
      .where(eq(userActiveAccounts.userId, payload.userId));

    if (!row || row.accountType === "personal") {
      return NextResponse.json({
        accountType: "personal" as AccountType,
        accountId: null,
      });
    }

    return NextResponse.json({
      accountType: row.accountType as AccountType,
      accountId: row.accountId,
    });
  } catch (error) {
    console.error("Error fetching active account:", error);
    return NextResponse.json(
      { error: "Failed to fetch active account" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { accountType, accountId } = body as {
      accountType: AccountType;
      accountId: string | null;
    };

    if (accountType === "team") {
      if (!accountId) {
        return NextResponse.json(
          { error: "accountId is required for team accounts" },
          { status: 400 }
        );
      }
      const membership = payload.teams?.find((t) => t.id === accountId);
      if (!membership) {
        return NextResponse.json(
          { error: "You are not a member of this team" },
          { status: 403 }
        );
      }
    }

    // Upsert: insert if missing, update if exists
    await db
      .insert(userActiveAccounts)
      .values({
        userId: payload.userId,
        accountType: accountType || "personal",
        accountId: accountType === "team" ? accountId : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userActiveAccounts.userId,
        set: {
          accountType: accountType || "personal",
          accountId: accountType === "team" ? accountId : null,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({
      accountType: accountType || "personal",
      accountId: accountType === "team" ? accountId : null,
    });
  } catch (error) {
    console.error("Error updating active account:", error);
    return NextResponse.json(
      { error: "Failed to update active account" },
      { status: 500 }
    );
  }
}
