import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import { addColumn, countTableColumns } from "@/lib/production-table/queries";
import { hasWriteAccess } from "@/lib/permissions";
import {
  MAX_PRODUCTION_TABLE_COLUMNS,
  type CellType,
} from "@/lib/production-table/types";

type Params = { tableId: string };

const VALID_CELL_TYPES: CellType[] = ["text", "media"];

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
        { error: `Maximum ${MAX_PRODUCTION_TABLE_COLUMNS} columns allowed` },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, cellType } = body as {
      name?: unknown;
      cellType?: unknown;
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

    const column = await addColumn(tableId, name.trim(), resolvedType);
    return NextResponse.json({ column });
  } catch (error) {
    console.error("Error adding column:", error);
    return NextResponse.json(
      { error: "Failed to add column" },
      { status: 500 }
    );
  }
}
