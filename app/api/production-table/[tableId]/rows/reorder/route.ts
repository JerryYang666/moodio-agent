import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import { reorderRows } from "@/lib/production-table/queries";
import { hasWriteAccess } from "@/lib/permissions";

type Params = { tableId: string };

export async function PATCH(
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
    const permission = await getTablePermission(tableId, payload.userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await req.json();
    const { rowIds } = body as { rowIds?: unknown };

    if (!Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json(
        { error: "rowIds array is required" },
        { status: 400 }
      );
    }

    await reorderRows(tableId, rowIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering rows:", error);
    return NextResponse.json(
      { error: "Failed to reorder rows" },
      { status: 500 }
    );
  }
}
