import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getDesktopPermission } from "@/lib/desktop/permissions";

/**
 * GET /api/desktop/[id]/permission
 * Returns the calling user's permission level for this desktop.
 * Used by the Go realtime server during WebSocket handshake auth.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    const permission = await getDesktopPermission(id, payload.userId);
    if (!permission) {
      return NextResponse.json(
        { error: "No access" },
        { status: 403 }
      );
    }

    return NextResponse.json({ permission });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
