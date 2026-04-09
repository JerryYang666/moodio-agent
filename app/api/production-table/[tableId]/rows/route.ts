import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import { addRow, countTableRows } from "@/lib/production-table/queries";
import { hasWriteAccess } from "@/lib/permissions";
import { MAX_PRODUCTION_TABLE_ROWS } from "@/lib/production-table/types";

type Params = { tableId: string };

export async function POST(
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

    const rowCount = await countTableRows(tableId);
    if (rowCount >= MAX_PRODUCTION_TABLE_ROWS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PRODUCTION_TABLE_ROWS} rows allowed` },
        { status: 400 }
      );
    }

    const row = await addRow(tableId);
    return NextResponse.json({ row });
  } catch (error) {
    console.error("Error adding row:", error);
    return NextResponse.json(
      { error: "Failed to add row" },
      { status: 500 }
    );
  }
}
