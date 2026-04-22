import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users, creditTransactions } from "@/lib/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";

/**
 * GET /api/users/credits/performers
 * Returns the distinct set of users who have performed transactions against
 * a given account. Currently only meaningful for team accounts; personal
 * accounts return an empty list to keep the client simple.
 */
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

    const { searchParams } = new URL(request.url);
    const accountType = searchParams.get("accountType") || "personal";
    const accountId = searchParams.get("accountId");

    if (accountType !== "team") {
      return NextResponse.json({ performers: [] });
    }

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

    const rows = await db
      .selectDistinct({
        userId: creditTransactions.performedBy,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(creditTransactions)
      .leftJoin(users, eq(creditTransactions.performedBy, users.id))
      .where(
        and(
          eq(creditTransactions.accountId, accountId),
          eq(creditTransactions.accountType, "team"),
          isNotNull(creditTransactions.performedBy)
        )
      );

    const performers = rows
      .filter((r): r is { userId: string; email: string | null; firstName: string | null; lastName: string | null } => !!r.userId)
      .map((r) => ({
        userId: r.userId,
        email: r.email ?? "",
        firstName: r.firstName,
        lastName: r.lastName,
      }));

    return NextResponse.json({ performers });
  } catch (error) {
    console.error("Error fetching credit performers:", error);
    return NextResponse.json(
      { error: "Failed to fetch performers" },
      { status: 500 }
    );
  }
}
