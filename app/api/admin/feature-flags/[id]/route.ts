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

    const { id } = await params;

    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.id, id));

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
      .where(eq(groupFlagOverrides.flagId, id));

    return NextResponse.json({ flag: { ...flag, overrides } });
  } catch (error) {
    console.error("Error fetching feature flag:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flag" },
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
    const { key, valueType, defaultValue, description, enabled } = body;

    // Get current flag to validate type changes
    const [currentFlag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.id, id));

    if (!currentFlag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Validate key if provided
    if (key !== undefined) {
      if (typeof key !== "string" || key.trim().length === 0) {
        return NextResponse.json({ error: "Key cannot be empty" }, { status: 400 });
      }
      if (key.length > 16) {
        return NextResponse.json(
          { error: "Key must be 16 characters or less" },
          { status: 400 }
        );
      }
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        return NextResponse.json(
          { error: "Key must start with a letter and contain only lowercase letters, numbers, and underscores" },
          { status: 400 }
        );
      }
    }

    // Validate valueType if provided
    const effectiveValueType = valueType ?? currentFlag.valueType;
    if (valueType !== undefined && !["boolean", "number", "string"].includes(valueType)) {
      return NextResponse.json(
        { error: "valueType must be 'boolean', 'number', or 'string'" },
        { status: 400 }
      );
    }

    // Validate defaultValue if provided
    let stringValue: string | undefined;
    if (defaultValue !== undefined) {
      stringValue = String(defaultValue);
      if (effectiveValueType === "boolean" && !["true", "false"].includes(stringValue)) {
        return NextResponse.json(
          { error: "defaultValue must be 'true' or 'false' for boolean type" },
          { status: 400 }
        );
      }
      if (effectiveValueType === "number" && isNaN(Number(stringValue))) {
        return NextResponse.json(
          { error: "defaultValue must be a valid number for number type" },
          { status: 400 }
        );
      }
    }

    const [updatedFlag] = await db
      .update(featureFlags)
      .set({
        ...(key !== undefined && { key: key.trim() }),
        ...(valueType !== undefined && { valueType }),
        ...(stringValue !== undefined && { defaultValue: stringValue }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(enabled !== undefined && { enabled }),
        updatedAt: new Date(),
      })
      .where(eq(featureFlags.id, id))
      .returning();

    return NextResponse.json({ flag: updatedFlag });
  } catch (error: unknown) {
    console.error("Error updating feature flag:", error);
    if (
      error instanceof Error &&
      error.message.includes("unique constraint")
    ) {
      return NextResponse.json(
        { error: "A flag with this key already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update feature flag" },
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

    const [deletedFlag] = await db
      .delete(featureFlags)
      .where(eq(featureFlags.id, id))
      .returning();

    if (!deletedFlag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting feature flag:", error);
    return NextResponse.json(
      { error: "Failed to delete feature flag" },
      { status: 500 }
    );
  }
}
