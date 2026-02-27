import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktops, desktopShares } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/desktop
 * List all desktops (owned + shared with user)
 */
export async function GET(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = payload.userId;

    const ownedDesktops = await db
      .select()
      .from(desktops)
      .where(eq(desktops.userId, userId))
      .orderBy(desc(desktops.updatedAt));

    const sharedDesktopsData = await db
      .select({
        desktop: desktops,
        permission: desktopShares.permission,
        sharedAt: desktopShares.sharedAt,
      })
      .from(desktopShares)
      .innerJoin(desktops, eq(desktopShares.desktopId, desktops.id))
      .where(eq(desktopShares.sharedWithUserId, userId))
      .orderBy(desc(desktopShares.sharedAt));

    const owned = ownedDesktops.map((d) => ({
      ...d,
      permission: "owner" as const,
      isOwner: true,
    }));

    const shared = sharedDesktopsData.map((item) => ({
      ...item.desktop,
      permission: item.permission,
      isOwner: false,
      sharedAt: item.sharedAt,
    }));

    return NextResponse.json({ desktops: [...owned, ...shared] });
  } catch (error) {
    console.error("Error fetching desktops:", error);
    return NextResponse.json(
      { error: "Failed to fetch desktops" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/desktop
 * Create a new desktop
 */
export async function POST(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const { name } = body as { name?: unknown };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Desktop name is required" },
        { status: 400 }
      );
    }

    const [newDesktop] = await db
      .insert(desktops)
      .values({
        userId: payload.userId,
        name: name.trim(),
      })
      .returning();

    return NextResponse.json({
      desktop: { ...newDesktop, permission: "owner", isOwner: true },
    });
  } catch (error) {
    console.error("Error creating desktop:", error);
    return NextResponse.json(
      { error: "Failed to create desktop" },
      { status: 500 }
    );
  }
}
