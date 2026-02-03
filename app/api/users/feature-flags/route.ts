import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users, featureFlags, groupFlagOverrides } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

type FlagValue = boolean | number | string;

function parseValue(value: string, valueType: string): FlagValue {
  switch (valueType) {
    case "boolean":
      return value === "true";
    case "number":
      return Number(value);
    default:
      return value;
  }
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user's testing groups
    const [user] = await db
      .select({ testingGroups: users.testingGroups })
      .from(users)
      .where(eq(users.id, payload.userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userGroupIds = user.testingGroups || [];

    // Get all enabled flags
    const allFlags = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.enabled, true));

    // Get overrides for user's groups
    let overrides: { flagId: string; value: string }[] = [];
    if (userGroupIds.length > 0) {
      overrides = await db
        .select({
          flagId: groupFlagOverrides.flagId,
          value: groupFlagOverrides.value,
        })
        .from(groupFlagOverrides)
        .where(inArray(groupFlagOverrides.groupId, userGroupIds));
    }

    // Build override map (flagId -> value)
    // If user is in multiple groups with overrides for the same flag,
    // the first one wins (could be made configurable with priority)
    const overrideMap = new Map<string, string>();
    for (const override of overrides) {
      if (!overrideMap.has(override.flagId)) {
        overrideMap.set(override.flagId, override.value);
      }
    }

    // Build final flags object
    const flags: Record<string, FlagValue> = {};
    for (const flag of allFlags) {
      const overrideValue = overrideMap.get(flag.id);
      const rawValue = overrideValue ?? flag.defaultValue;
      flags[flag.key] = parseValue(rawValue, flag.valueType);
    }

    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Error fetching feature flags:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flags" },
      { status: 500 }
    );
  }
}
