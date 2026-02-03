import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { featureFlags, groupFlagOverrides, testingGroups } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

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

    const { id: flagId } = await params;

    // Verify flag exists
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.id, flagId));

    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Get overrides with group names
    const overrides = await db
      .select({
        id: groupFlagOverrides.id,
        flagId: groupFlagOverrides.flagId,
        groupId: groupFlagOverrides.groupId,
        groupName: testingGroups.name,
        value: groupFlagOverrides.value,
        createdAt: groupFlagOverrides.createdAt,
        updatedAt: groupFlagOverrides.updatedAt,
      })
      .from(groupFlagOverrides)
      .innerJoin(testingGroups, eq(groupFlagOverrides.groupId, testingGroups.id))
      .where(eq(groupFlagOverrides.flagId, flagId));

    return NextResponse.json({ overrides });
  } catch (error) {
    console.error("Error fetching flag overrides:", error);
    return NextResponse.json(
      { error: "Failed to fetch flag overrides" },
      { status: 500 }
    );
  }
}

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

    const { id: flagId } = await params;
    const body = await request.json();
    const { groupId, groupIds, value } = body;

    // Support both single groupId and batch groupIds
    const targetGroupIds: string[] = groupIds || (groupId ? [groupId] : []);

    // Validate inputs
    if (targetGroupIds.length === 0) {
      return NextResponse.json(
        { error: "groupId or groupIds is required" },
        { status: 400 }
      );
    }
    if (value === undefined || value === null) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    // Verify flag exists and get its type
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.id, flagId));

    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Verify all groups exist
    const existingGroups = await db
      .select({ id: testingGroups.id, name: testingGroups.name })
      .from(testingGroups)
      .where(inArray(testingGroups.id, targetGroupIds));

    if (existingGroups.length !== targetGroupIds.length) {
      const foundIds = new Set(existingGroups.map((g) => g.id));
      const missingIds = targetGroupIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        { error: `Groups not found: ${missingIds.join(", ")}` },
        { status: 404 }
      );
    }

    // Validate value matches flag type
    const stringValue = String(value);
    if (flag.valueType === "boolean" && !["true", "false"].includes(stringValue)) {
      return NextResponse.json(
        { error: "value must be 'true' or 'false' for boolean flag" },
        { status: 400 }
      );
    }
    if (flag.valueType === "number" && isNaN(Number(stringValue))) {
      return NextResponse.json(
        { error: "value must be a valid number for number flag" },
        { status: 400 }
      );
    }

    // Create group name lookup
    const groupNameMap = new Map(existingGroups.map((g) => [g.id, g.name]));

    // Insert all overrides in a single transaction
    const newOverrides = await db
      .insert(groupFlagOverrides)
      .values(
        targetGroupIds.map((gid) => ({
          flagId,
          groupId: gid,
          value: stringValue,
        }))
      )
      .returning();

    // Return with group names
    const overridesWithNames = newOverrides.map((override) => ({
      ...override,
      groupName: groupNameMap.get(override.groupId) || "Unknown",
    }));

    // Return single override for backward compatibility, or array for batch
    if (groupIds) {
      return NextResponse.json({ overrides: overridesWithNames });
    } else {
      return NextResponse.json({ override: overridesWithNames[0] });
    }
  } catch (error: unknown) {
    console.error("Error creating flag override:", error);
    if (
      error instanceof Error &&
      error.message.includes("unique constraint")
    ) {
      return NextResponse.json(
        { error: "An override for one or more groups already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create flag override" },
      { status: 500 }
    );
  }
}
