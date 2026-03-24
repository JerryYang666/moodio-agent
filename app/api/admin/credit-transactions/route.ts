import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { creditTransactions, users, teams } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const allTransactions = await db
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
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(creditTransactions)
      .leftJoin(users, eq(creditTransactions.accountId, users.id))
      .orderBy(desc(creditTransactions.createdAt));

    // Resolve team names for team transactions
    const teamIds = Array.from(
      new Set(
        allTransactions
          .filter((t) => t.accountType === "team")
          .map((t) => t.accountId)
      )
    );

    const teamMap: Record<string, string> = {};
    if (teamIds.length > 0) {
      const teamRecords = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, teamIds));

      for (const t of teamRecords) {
        teamMap[t.id] = t.name;
      }
    }

    // Resolve performer info
    const performerIds = Array.from(
      new Set(
        allTransactions
          .filter((t) => t.performedBy)
          .map((t) => t.performedBy as string)
      )
    );

    const performerMap: Record<string, { email: string; firstName: string | null; lastName: string | null }> = {};
    if (performerIds.length > 0) {
      const performers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(inArray(users.id, performerIds));

      for (const p of performers) {
        performerMap[p.id] = {
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
        };
      }
    }

    const transactionsWithDetails = allTransactions.map((t) => ({
      ...t,
      teamName: t.accountType === "team" ? (teamMap[t.accountId] ?? null) : null,
      performerEmail: t.performedBy ? performerMap[t.performedBy]?.email : null,
      performerFirstName: t.performedBy ? performerMap[t.performedBy]?.firstName : null,
      performerLastName: t.performedBy ? performerMap[t.performedBy]?.lastName : null,
    }));

    return NextResponse.json({ transactions: transactionsWithDetails });
  } catch (error) {
    console.error("Error fetching credit transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit transactions" },
      { status: 500 }
    );
  }
}
