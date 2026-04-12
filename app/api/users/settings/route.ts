import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_USER_SETTINGS,
  VALID_SETTINGS_KEYS,
} from "@/lib/user-settings/types";
import type { UserSettings } from "@/lib/user-settings/types";

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

    const [user] = await db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, payload.userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const settings = {
      ...DEFAULT_USER_SETTINGS,
      ...(user.settings as UserSettings),
    };

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch user settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();

    // Strip unknown keys
    const patch: Partial<UserSettings> = {};
    for (const key of VALID_SETTINGS_KEYS) {
      if (key in body) {
        (patch as Record<string, unknown>)[key] = body[key];
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No valid settings provided" },
        { status: 400 }
      );
    }

    // Read current settings, merge, write back
    const [user] = await db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, payload.userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const current = (user.settings as UserSettings) ?? {};
    const merged = { ...current, ...patch };

    await db
      .update(users)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(users.id, payload.userId));

    const resolved = { ...DEFAULT_USER_SETTINGS, ...merged };

    return NextResponse.json({ settings: resolved });
  } catch (error) {
    console.error("Error updating user settings:", error);
    return NextResponse.json(
      { error: "Failed to update user settings" },
      { status: 500 }
    );
  }
}
