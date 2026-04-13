import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_USER_SETTINGS } from "./types";
import type { UserSettings } from "./types";

/**
 * Get all resolved settings for a user (DB values merged over defaults).
 */
export async function getUserSettings(
  userId: string
): Promise<Required<UserSettings>> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { settings: true },
  });

  if (!row) {
    return { ...DEFAULT_USER_SETTINGS };
  }

  return { ...DEFAULT_USER_SETTINGS, ...(row.settings as UserSettings) };
}

/**
 * Get a single setting value for a user.
 */
export async function getUserSetting<K extends keyof UserSettings>(
  userId: string,
  key: K
): Promise<Required<UserSettings>[K]> {
  const settings = await getUserSettings(userId);
  return settings[key];
}

/**
 * Get multiple setting values for a user in a single DB round trip.
 * Returns a pick of the resolved settings object containing only the requested keys.
 */
export async function getUserSettingsMulti<K extends keyof UserSettings>(
  userId: string,
  keys: K[]
): Promise<Pick<Required<UserSettings>, K>> {
  const settings = await getUserSettings(userId);
  const result = {} as Pick<Required<UserSettings>, K>;
  for (const key of keys) {
    result[key] = settings[key];
  }
  return result;
}
