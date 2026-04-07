import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import { deleteRow, resizeRow } from "@/lib/production-table/queries";
import { hasWriteAccess } from "@/lib/permissions";

type Params = { tableId: string; rowId: string };

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

    const { tableId, rowId } = await params;
    const permission = await getTablePermission(tableId, payload.userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await req.json();
    const { height } = body as { height?: unknown };

    if (typeof height !== "number") {
      return NextResponse.json({ error: "height is required" }, { status: 400 });
    }

    const row = await resizeRow(rowId, height);
    return NextResponse.json({ row });
  } catch (error) {
    console.error("Error updating row:", error);
    return NextResponse.json(
      { error: "Failed to update row" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { tableId, rowId } = await params;
    const permission = await getTablePermission(tableId, payload.userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    await deleteRow(rowId, tableId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting row:", error);
    return NextResponse.json(
      { error: "Failed to delete row" },
      { status: 500 }
    );
  }
}
