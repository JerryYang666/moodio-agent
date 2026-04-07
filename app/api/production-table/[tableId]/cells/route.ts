import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { canEditCell } from "@/lib/production-table/permissions";
import { upsertCell } from "@/lib/production-table/queries";
import { getTablePermission } from "@/lib/production-table/permissions";
import type { UpsertCellPayload } from "@/lib/production-table/types";

type Params = { tableId: string };

export async function PUT(
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

    const tablePerm = await getTablePermission(tableId, payload.userId);
    if (!tablePerm) {
      return NextResponse.json(
        { error: "Table not found or access denied" },
        { status: 404 }
      );
    }

    const body = (await req.json()) as UpsertCellPayload;
    const { columnId, rowId, textContent, mediaAssets } = body;

    if (!columnId || !rowId) {
      return NextResponse.json(
        { error: "columnId and rowId are required" },
        { status: 400 }
      );
    }

    const canEdit = await canEditCell(tableId, columnId, rowId, payload.userId);
    if (!canEdit) {
      return NextResponse.json(
        { error: "No edit permission for this cell" },
        { status: 403 }
      );
    }

    const cell = await upsertCell(
      tableId,
      columnId,
      rowId,
      textContent,
      mediaAssets,
      payload.userId
    );

    return NextResponse.json({ cell });
  } catch (error) {
    console.error("Error upserting cell:", error);
    return NextResponse.json(
      { error: "Failed to upsert cell" },
      { status: 500 }
    );
  }
}
