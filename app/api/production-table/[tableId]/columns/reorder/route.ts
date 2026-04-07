import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import { reorderColumns } from "@/lib/production-table/queries";
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
    const { columnIds } = body as { columnIds?: unknown };

    if (!Array.isArray(columnIds) || columnIds.length === 0) {
      return NextResponse.json(
        { error: "columnIds array is required" },
        { status: 400 }
      );
    }

    await reorderColumns(tableId, columnIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering columns:", error);
    return NextResponse.json(
      { error: "Failed to reorder columns" },
      { status: 500 }
    );
  }
}
