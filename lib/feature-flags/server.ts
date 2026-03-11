import { db } from "@/lib/db";
import { users, featureFlags, groupFlagOverrides } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Check a feature flag value for a given user ID (server-side).
 * Returns the resolved flag value or the default.
 */
export async function getFeatureFlagForUser(
  userId: string,
  flagKey: string
): Promise<string | null> {
  const flag = await db.query.featureFlags.findFirst({
    where: eq(featureFlags.key, flagKey),
  });

  if (!flag || !flag.enabled) {
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { testingGroups: true },
  });

  if (!user || !user.testingGroups || user.testingGroups.length === 0) {
    return flag.defaultValue;
  }

  const overrides = await db
    .select({ value: groupFlagOverrides.value })
    .from(groupFlagOverrides)
    .where(
      and(
        eq(groupFlagOverrides.flagId, flag.id),
        inArray(groupFlagOverrides.groupId, user.testingGroups)
      )
    )
    .limit(1);

  if (overrides.length > 0) {
    return overrides[0].value;
  }

  return flag.defaultValue;
}

/**
 * Convenience: check if a boolean flag is true for a user.
 */
export async function isFeatureFlagEnabled(
  userId: string,
  flagKey: string
): Promise<boolean> {
  const value = await getFeatureFlagForUser(userId, flagKey);
  return value === "true";
}
