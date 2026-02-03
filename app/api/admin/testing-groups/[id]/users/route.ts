import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { testingGroups, users } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * GET /api/admin/testing-groups/[id]/users
 * Get all users in a testing group
 */
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

    const { id: groupId } = await params;

    // Verify group exists
    const [group] = await db
      .select()
      .from(testingGroups)
      .where(eq(testingGroups.id, groupId));

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Get users in this group
    const groupUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(sql`${users.testingGroups} @> ${JSON.stringify([groupId])}::jsonb`);

    return NextResponse.json({ users: groupUsers });
  } catch (error) {
    console.error("Error fetching group users:", error);
    return NextResponse.json(
      { error: "Failed to fetch group users" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/testing-groups/[id]/users
 * Add users to a testing group (batch)
 * Body: { userIds: string[] }
 */
export async function POST(
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

    const { id: groupId } = await params;
    const body = await request.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "userIds array is required" },
        { status: 400 }
      );
    }

    // Verify group exists
    const [group] = await db
      .select()
      .from(testingGroups)
      .where(eq(testingGroups.id, groupId));

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Verify all users exist
    const existingUsers = await db
      .select({ id: users.id, testingGroups: users.testingGroups })
      .from(users)
      .where(inArray(users.id, userIds));

    if (existingUsers.length !== userIds.length) {
      const foundIds = new Set(existingUsers.map((u) => u.id));
      const missingIds = userIds.filter((id: string) => !foundIds.has(id));
      return NextResponse.json(
        { error: `Users not found: ${missingIds.join(", ")}` },
        { status: 404 }
      );
    }

    // Add group to each user's testingGroups array (if not already present)
    let addedCount = 0;
    let alreadyInGroupCount = 0;

    for (const user of existingUsers) {
      const currentGroups = user.testingGroups || [];
      if (!currentGroups.includes(groupId)) {
        await db
          .update(users)
          .set({
            testingGroups: [...currentGroups, groupId],
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
        addedCount++;
      } else {
        alreadyInGroupCount++;
      }
    }

    return NextResponse.json({
      success: true,
      addedCount,
      alreadyInGroupCount,
    });
  } catch (error) {
    console.error("Error adding users to group:", error);
    return NextResponse.json(
      { error: "Failed to add users to group" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/testing-groups/[id]/users
 * Remove users from a testing group (batch)
 * Body: { userIds: string[] }
 */
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

    const { id: groupId } = await params;
    const body = await request.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "userIds array is required" },
        { status: 400 }
      );
    }

    // Verify group exists
    const [group] = await db
      .select()
      .from(testingGroups)
      .where(eq(testingGroups.id, groupId));

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Remove group from each user's testingGroups array
    await db.execute(sql`
      UPDATE users 
      SET testing_groups = testing_groups - ${groupId}::text,
          updated_at = NOW()
      WHERE id = ANY(${userIds}::uuid[])
      AND testing_groups @> ${JSON.stringify([groupId])}::jsonb
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing users from group:", error);
    return NextResponse.json(
      { error: "Failed to remove users from group" },
      { status: 500 }
    );
  }
}
