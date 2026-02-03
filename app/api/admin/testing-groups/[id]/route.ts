import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { testingGroups, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    const [group] = await db
      .select()
      .from(testingGroups)
      .where(eq(testingGroups.id, id));

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Get user count
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.testingGroups} @> ${JSON.stringify([id])}::jsonb`);

    return NextResponse.json({
      group: {
        ...group,
        userCount: result?.count ?? 0,
      },
    });
  } catch (error) {
    console.error("Error fetching testing group:", error);
    return NextResponse.json(
      { error: "Failed to fetch testing group" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description } = body;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Name cannot be empty" },
          { status: 400 }
        );
      }
      if (name.length > 50) {
        return NextResponse.json(
          { error: "Name must be 50 characters or less" },
          { status: 400 }
        );
      }
    }

    const [updatedGroup] = await db
      .update(testingGroups)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
        updatedAt: new Date(),
      })
      .where(eq(testingGroups.id, id))
      .returning();

    if (!updatedGroup) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ group: updatedGroup });
  } catch (error: unknown) {
    console.error("Error updating testing group:", error);
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
      { error: "Failed to update testing group" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    // Remove group from all users' testingGroups arrays
    await db.execute(sql`
      UPDATE users 
      SET testing_groups = testing_groups - ${id}::text
      WHERE testing_groups @> ${JSON.stringify([id])}::jsonb
    `);

    const [deletedGroup] = await db
      .delete(testingGroups)
      .where(eq(testingGroups.id, id))
      .returning();

    if (!deletedGroup) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting testing group:", error);
    return NextResponse.json(
      { error: "Failed to delete testing group" },
      { status: 500 }
    );
  }
}
