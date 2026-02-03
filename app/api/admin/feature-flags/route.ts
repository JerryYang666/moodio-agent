import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { featureFlags, groupFlagOverrides, testingGroups } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

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

    // Get all flags with their overrides
    const flags = await db
      .select()
      .from(featureFlags)
      .orderBy(desc(featureFlags.createdAt));

    // Get overrides for each flag with group names
    const flagsWithOverrides = await Promise.all(
      flags.map(async (flag) => {
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
          .where(eq(groupFlagOverrides.flagId, flag.id));

        return {
          ...flag,
          overrides,
        };
      })
    );

    return NextResponse.json({ flags: flagsWithOverrides });
  } catch (error) {
    console.error("Error fetching feature flags:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flags" },
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
    const { key, valueType, defaultValue, description, enabled } = body;

    // Validate key
    if (!key || typeof key !== "string" || key.trim().length === 0) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }
    if (key.length > 16) {
      return NextResponse.json(
        { error: "Key must be 16 characters or less" },
        { status: 400 }
      );
    }
    // Key should be alphanumeric with underscores
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      return NextResponse.json(
        { error: "Key must start with a letter and contain only lowercase letters, numbers, and underscores" },
        { status: 400 }
      );
    }

    // Validate valueType
    if (!["boolean", "number", "string"].includes(valueType)) {
      return NextResponse.json(
        { error: "valueType must be 'boolean', 'number', or 'string'" },
        { status: 400 }
      );
    }

    // Validate defaultValue based on type
    if (defaultValue === undefined || defaultValue === null) {
      return NextResponse.json(
        { error: "defaultValue is required" },
        { status: 400 }
      );
    }

    // Convert defaultValue to string for storage
    const stringValue = String(defaultValue);

    // Validate the value matches the type
    if (valueType === "boolean" && !["true", "false"].includes(stringValue)) {
      return NextResponse.json(
        { error: "defaultValue must be 'true' or 'false' for boolean type" },
        { status: 400 }
      );
    }
    if (valueType === "number" && isNaN(Number(stringValue))) {
      return NextResponse.json(
        { error: "defaultValue must be a valid number for number type" },
        { status: 400 }
      );
    }

    const [newFlag] = await db
      .insert(featureFlags)
      .values({
        key: key.trim(),
        valueType,
        defaultValue: stringValue,
        description: description?.trim() || null,
        enabled: enabled !== false,
      })
      .returning();

    return NextResponse.json({ flag: { ...newFlag, overrides: [] } });
  } catch (error: unknown) {
    console.error("Error creating feature flag:", error);
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
      { error: "Failed to create feature flag" },
      { status: 500 }
    );
  }
}
