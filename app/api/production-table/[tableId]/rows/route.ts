import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import {
  addRow,
  bulkRestoreCells,
  countTableRows,
} from "@/lib/production-table/queries";
import { hasWriteAccess } from "@/lib/permissions";
import {
  MAX_PRODUCTION_TABLE_ROWS,
  type CellComment,
  type MediaAssetRef,
} from "@/lib/production-table/types";

type Params = { tableId: string };

/**
 * POST /api/production-table/[tableId]/rows
 *
 * Create a new row. Accepts an optional `id` (used by undo to restore a
 * previously-deleted row) and an optional `cells` array (so cell content
 * is restored together with the row).
 */
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
        {
          error: `Maximum ${MAX_PRODUCTION_TABLE_ROWS} rows allowed`,
          errorCode: "PT_MAX_ROWS_REACHED",
        },
        { status: 400 }
      );
    }

    // Body is optional — a plain POST with no body keeps the original
    // "append empty row" behavior.
    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      // No body — fall through with defaults.
    }

    const { id, height, sortOrder, cells } = body;

    let row;
    try {
      row = await addRow(tableId, {
        id: typeof id === "string" ? id : undefined,
        height: typeof height === "number" ? height : undefined,
        sortOrder: typeof sortOrder === "number" ? sortOrder : undefined,
      });
    } catch (err) {
      const msg = String((err as Error).message ?? "");
      if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
        return NextResponse.json(
          { error: "Row id already exists", errorCode: "PT_ROW_ID_CONFLICT" },
          { status: 409 }
        );
      }
      throw err;
    }

    if (Array.isArray(cells) && cells.length > 0) {
      const restoreValues: Array<{
        columnId: string;
        rowId: string;
        textContent: string | null;
        mediaAssets: MediaAssetRef[] | null;
        comment: CellComment | null;
        updatedBy: string | null;
      }> = [];
      for (const c of cells as Array<Record<string, unknown>>) {
        if (typeof c.columnId !== "string") continue;
        restoreValues.push({
          columnId: c.columnId,
          rowId: row.id,
          textContent: typeof c.textContent === "string" ? c.textContent : null,
          mediaAssets: Array.isArray(c.mediaAssets)
            ? (c.mediaAssets as MediaAssetRef[])
            : null,
          comment: (c.comment as CellComment | null) ?? null,
          updatedBy: typeof c.updatedBy === "string" ? c.updatedBy : payload.userId,
        });
      }
      if (restoreValues.length > 0) {
        await bulkRestoreCells(tableId, restoreValues);
      }
    }

    return NextResponse.json({ row });
  } catch (error) {
    console.error("Error adding row:", error);
    return NextResponse.json(
      { error: "Failed to add row" },
      { status: 500 }
    );
  }
}
