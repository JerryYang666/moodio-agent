import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { creditTransactions, users, teams } from "@/lib/db/schema";
import { desc, eq, and, or, ilike, count, sum, gt, lt, type SQL } from "drizzle-orm";

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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const typeFilter = searchParams.get("type") || "";
    const search = searchParams.get("search") || "";

    const conditions: SQL[] = [];

    if (typeFilter) {
      conditions.push(eq(creditTransactions.type, typeFilter));
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(creditTransactions.description, pattern),
          ilike(creditTransactions.id, pattern),
          ilike(users.email, pattern),
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db
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
      .leftJoin(users, eq(creditTransactions.accountId, users.id));

    const [rows, [{ total }], [{ totalCredits }], [{ totalDebits }]] = await Promise.all([
      baseQuery
        .where(whereClause)
        .orderBy(desc(creditTransactions.createdAt))
        .limit(limit)
        .offset(offset),

      db
        .select({ total: count() })
        .from(creditTransactions)
        .leftJoin(users, eq(creditTransactions.accountId, users.id))
        .where(whereClause),

      db
        .select({ totalCredits: sum(creditTransactions.amount) })
        .from(creditTransactions)
        .leftJoin(users, eq(creditTransactions.accountId, users.id))
        .where(whereClause ? and(whereClause, gt(creditTransactions.amount, 0)) : gt(creditTransactions.amount, 0)),

      db
        .select({ totalDebits: sum(creditTransactions.amount) })
        .from(creditTransactions)
        .leftJoin(users, eq(creditTransactions.accountId, users.id))
        .where(whereClause ? and(whereClause, lt(creditTransactions.amount, 0)) : lt(creditTransactions.amount, 0)),
    ]);

    // Resolve team names for team transactions in this page
    const teamIds = Array.from(
      new Set(
        rows
          .filter((t) => t.accountType === "team")
          .map((t) => t.accountId)
      )
    );

    const teamMap: Record<string, string> = {};
    if (teamIds.length > 0) {
      const teamRecords = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(
          teamIds.length === 1
            ? eq(teams.id, teamIds[0])
            : or(...teamIds.map((id) => eq(teams.id, id)))!
        );

      for (const t of teamRecords) {
        teamMap[t.id] = t.name;
      }
    }

    // Resolve performer info for this page only
    const performerIds = Array.from(
      new Set(
        rows
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
        .where(
          performerIds.length === 1
            ? eq(users.id, performerIds[0])
            : or(...performerIds.map((id) => eq(users.id, id)))!
        );

      for (const p of performers) {
        performerMap[p.id] = {
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
        };
      }
    }

    const transactionsWithDetails = rows.map((t) => ({
      ...t,
      teamName: t.accountType === "team" ? (teamMap[t.accountId] ?? null) : null,
      performerEmail: t.performedBy ? performerMap[t.performedBy]?.email ?? null : null,
      performerFirstName: t.performedBy ? performerMap[t.performedBy]?.firstName ?? null : null,
      performerLastName: t.performedBy ? performerMap[t.performedBy]?.lastName ?? null : null,
    }));

    const credits = Number(totalCredits) || 0;
    const debits = Math.abs(Number(totalDebits) || 0);

    return NextResponse.json({
      transactions: transactionsWithDetails,
      totalCount: total,
      page,
      limit,
      totals: {
        credits,
        debits,
        net: credits - debits,
      },
    });
  } catch (error) {
    console.error("Error fetching credit transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit transactions" },
      { status: 500 }
    );
  }
}
