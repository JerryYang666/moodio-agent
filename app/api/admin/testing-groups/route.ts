import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { testingGroups, users } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";

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

    // Get all groups with user counts
    const groups = await db
      .select({
        id: testingGroups.id,
        name: testingGroups.name,
        description: testingGroups.description,
        createdAt: testingGroups.createdAt,
        updatedAt: testingGroups.updatedAt,
      })
      .from(testingGroups)
      .orderBy(desc(testingGroups.createdAt));

    // Get user counts for each group
    const groupsWithCounts = await Promise.all(
      groups.map(async (group) => {
        const [result] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(sql`${users.testingGroups} @> ${JSON.stringify([group.id])}::jsonb`);
        return {
          ...group,
          userCount: result?.count ?? 0,
        };
      })
    );

    return NextResponse.json({ groups: groupsWithCounts });
  } catch (error) {
    console.error("Error fetching testing groups:", error);
    return NextResponse.json(
      { error: "Failed to fetch testing groups" },
      { status: 500 }
    );
  }
}

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
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (name.length > 50) {
      return NextResponse.json(
        { error: "Name must be 50 characters or less" },
        { status: 400 }
      );
    }

    const [newGroup] = await db
      .insert(testingGroups)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
      })
      .returning();

    return NextResponse.json({ group: { ...newGroup, userCount: 0 } });
  } catch (error: unknown) {
    console.error("Error creating testing group:", error);
    // Check for unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes("unique constraint")
    ) {
      return NextResponse.json(
        { error: "A group with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create testing group" },
      { status: 500 }
    );
  }
}
