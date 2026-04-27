import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import {
  addColumn,
  bulkRestoreCells,
  countTableColumns,
} from "@/lib/production-table/queries";
import { hasWriteAccess } from "@/lib/permissions";
import {
  MAX_PRODUCTION_TABLE_COLUMNS,
  type CellType,
  type CellComment,
  type MediaAssetRef,
} from "@/lib/production-table/types";

type Params = { tableId: string };

const VALID_CELL_TYPES: CellType[] = ["text", "media"];

/**
 * POST /api/production-table/[tableId]/columns
 *
 * Create a new column. Accepts an optional `id` (used by undo to restore a
 * previously-deleted column) and an optional `cells` array (so the cell
 * content that lived in the column before deletion is restored atomically).
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

    const columnCount = await countTableColumns(tableId);
    if (columnCount >= MAX_PRODUCTION_TABLE_COLUMNS) {
      return NextResponse.json(
        {
          error: `Maximum ${MAX_PRODUCTION_TABLE_COLUMNS} columns allowed`,
          errorCode: "PT_MAX_COLUMNS_REACHED",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      id,
      name,
      cellType,
      width,
      sortOrder,
      cells,
    } = body as {
      id?: unknown;
      name?: unknown;
      cellType?: unknown;
      width?: unknown;
      sortOrder?: unknown;
      cells?: unknown;
    };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Column name is required" },
        { status: 400 }
      );
    }

    const resolvedType: CellType =
      typeof cellType === "string" &&
      VALID_CELL_TYPES.includes(cellType as CellType)
        ? (cellType as CellType)
        : "text";

    let column;
    try {
      column = await addColumn(tableId, name.trim(), resolvedType, {
        id: typeof id === "string" ? id : undefined,
        width: typeof width === "number" ? width : undefined,
        sortOrder: typeof sortOrder === "number" ? sortOrder : undefined,
      });
    } catch (err) {
      // Primary-key collision: signal so the client can fall back to a
      // fresh-id create.
      const msg = String((err as Error).message ?? "");
      if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
        return NextResponse.json(
          { error: "Column id already exists", errorCode: "PT_COLUMN_ID_CONFLICT" },
          { status: 409 }
        );
      }
      throw err;
    }

    // Restore cell content (used by undo of a column-delete).
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
        if (typeof c.rowId !== "string") continue;
        restoreValues.push({
          columnId: column.id,
          rowId: c.rowId,
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

    return NextResponse.json({ column });
  } catch (error) {
    console.error("Error adding column:", error);
    return NextResponse.json(
      { error: "Failed to add column" },
      { status: 500 }
    );
  }
}
