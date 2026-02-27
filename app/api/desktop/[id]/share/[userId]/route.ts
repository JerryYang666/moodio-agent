import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktops, desktopShares } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";

async function isDesktopOwner(desktopId: string, userId: string): Promise<boolean> {
  const [desktop] = await db
    .select()
    .from(desktops)
    .where(and(eq(desktops.id, desktopId), eq(desktops.userId, userId)))
    .limit(1);

  return !!desktop;
}

/**
 * DELETE /api/desktop/[id]/share/[userId]
 * Remove user's access to desktop (owner only)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { id, userId: targetUserId } = await params;

    if (!(await isDesktopOwner(id, payload.userId))) {
      return NextResponse.json(
        { error: "Only the owner can remove access" },
        { status: 403 }
      );
    }

    const result = await db
      .delete(desktopShares)
      .where(
        and(
          eq(desktopShares.desktopId, id),
          eq(desktopShares.sharedWithUserId, targetUserId)
        )
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing desktop share:", error);
    return NextResponse.json(
      { error: "Failed to remove share" },
      { status: 500 }
    );
  }
}
