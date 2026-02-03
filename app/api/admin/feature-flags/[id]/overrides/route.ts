import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { featureFlags, groupFlagOverrides, testingGroups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
    const { groupId, value } = body;

    // Validate inputs
    if (!groupId) {
      return NextResponse.json({ error: "groupId is required" }, { status: 400 });
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

    // Verify group exists
    const [group] = await db
      .select()
      .from(testingGroups)
      .where(eq(testingGroups.id, groupId));

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
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

    const [newOverride] = await db
      .insert(groupFlagOverrides)
      .values({
        flagId,
        groupId,
        value: stringValue,
      })
      .returning();

    return NextResponse.json({
      override: {
        ...newOverride,
        groupName: group.name,
      },
    });
  } catch (error: unknown) {
    console.error("Error creating flag override:", error);
    if (
      error instanceof Error &&
      error.message.includes("unique constraint")
    ) {
      return NextResponse.json(
        { error: "An override for this group already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create flag override" },
      { status: 500 }
    );
  }
}
