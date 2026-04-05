import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission, getEditableGrants } from "@/lib/production-table/permissions";

type Params = { tableId: string };

/**
 * GET /api/production-table/[tableId]/permission
 * Returns the calling user's permission level for this table.
 * Used by the Go realtime server during WebSocket handshake auth.
 *
 * Viewers with granular column/row edit grants are promoted to "editor"
 * so the Go relay doesn't block their mutation events.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
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

    const { tableId } = await params;
    const userId = req.nextUrl.searchParams.get("userId") || payload.userId;
    const permission = await getTablePermission(tableId, userId);
    if (!permission) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    if (permission === "viewer") {
      const grants = await getEditableGrants(tableId, userId);
      if (grants.columnIds.length > 0 || grants.rowIds.length > 0) {
        return NextResponse.json({ permission: "editor" });
      }
    }

    return NextResponse.json({ permission });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
