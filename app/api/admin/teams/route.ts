import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { teams, teamMembers, teamCredits, users } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const allTeams = await db
      .select({
        id: teams.id,
        name: teams.name,
        ownerId: teams.ownerId,
        ownerEmail: users.email,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
        createdAt: teams.createdAt,
      })
      .from(teams)
      .leftJoin(users, eq(teams.ownerId, users.id));

    const memberCounts = await db
      .select({
        teamId: teamMembers.teamId,
        count: count(),
      })
      .from(teamMembers)
      .groupBy(teamMembers.teamId);

    const countMap: Record<string, number> = {};
    for (const mc of memberCounts) {
      countMap[mc.teamId] = mc.count;
    }

    const balances = await db.select().from(teamCredits);
    const balanceMap: Record<string, number> = {};
    for (const b of balances) {
      balanceMap[b.teamId] = b.balance;
    }

    const result = allTeams.map((t) => ({
      ...t,
      memberCount: countMap[t.id] || 0,
      balance: balanceMap[t.id] || 0,
    }));

    return NextResponse.json({ teams: result });
  } catch (error) {
    console.error("Error fetching teams:", error);
    return NextResponse.json(
      { error: "Failed to fetch teams" },
      { status: 500 }
    );
  }
}
