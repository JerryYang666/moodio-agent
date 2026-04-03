import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import {
  users,
  userCredits,
  teamCredits,
  creditTransactions,
} from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import type { AccountType } from "@/lib/credits";

/**
 * GET /api/users/credits
 * View endpoint for transaction history. Accepts explicit accountType/accountId
 * query params so the credits page can browse any account the user has access to
 * without changing the global billing preference.
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
    const accountType = (searchParams.get("accountType") || "personal") as AccountType;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let accountId: string;

    if (accountType === "team") {
      accountId = searchParams.get("accountId") || "";
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
    } else {
      accountId = payload.userId;
    }

    // Get balance
    let balance: number;
    if (accountType === "team") {
      const [record] = await db
        .select()
        .from(teamCredits)
        .where(eq(teamCredits.teamId, accountId))
        .limit(1);
      balance = record?.balance ?? 0;
    } else {
      let credits = await db
        .select()
        .from(userCredits)
        .where(eq(userCredits.userId, accountId))
        .limit(1);

      if (credits.length === 0) {
        const [newCredit] = await db
          .insert(userCredits)
          .values({ userId: accountId, balance: 0 })
          .returning();
        credits = [newCredit];
      }
      balance = credits[0].balance;
    }

    // Get total count for pagination
    const [{ total }] = await db
      .select({ total: count() })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.accountId, accountId),
          eq(creditTransactions.accountType, accountType)
        )
      );

    // Get transaction history with performer details
    const rows = await db
      .select({
        id: creditTransactions.id,
        accountId: creditTransactions.accountId,
        accountType: creditTransactions.accountType,
        amount: creditTransactions.amount,
        type: creditTransactions.type,
        description: creditTransactions.description,
        performedBy: creditTransactions.performedBy,
        relatedEntityType: creditTransactions.relatedEntityType,
        relatedEntityId: creditTransactions.relatedEntityId,
        createdAt: creditTransactions.createdAt,
        performedByEmail: users.email,
        performedByFirstName: users.firstName,
        performedByLastName: users.lastName,
      })
      .from(creditTransactions)
      .leftJoin(users, eq(creditTransactions.performedBy, users.id))
      .where(
        and(
          eq(creditTransactions.accountId, accountId),
          eq(creditTransactions.accountType, accountType)
        )
      )
      .orderBy(desc(creditTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      balance,
      accountType,
      accountId,
      transactions: rows,
      totalCount: total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching user credits:", error);
    return NextResponse.json(
      { error: "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
