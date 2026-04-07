import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { PERMISSION_OWNER } from "@/lib/permissions";
import {
  createTable,
  bulkAddColumns,
  bulkAddRows,
  bulkInsertCells,
} from "@/lib/production-table/queries";
import { generateRowsFromScript } from "@/lib/production-table/ai-generate";
import type { CellType } from "@/lib/production-table/types";

const VALID_CELL_TYPES: CellType[] = ["text", "media"];
const MAX_ROW_COUNT = 200;
const MAX_SCRIPT_LENGTH = 50_000;

interface InitializeBody {
  name?: unknown;
  teamId?: unknown;
  columns?: unknown;
  mode?: unknown;
  scriptText?: unknown;
  rowCount?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body: InitializeBody = await req.json();
    const { name, teamId, columns, mode, scriptText, rowCount } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Table name is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { error: "At least one column is required" },
        { status: 400 }
      );
    }

    const validatedColumns: Array<{ name: string; cellType: CellType }> = [];
    for (const col of columns) {
      if (
        !col ||
        typeof col.name !== "string" ||
        !col.name.trim() ||
        !VALID_CELL_TYPES.includes(col.cellType)
      ) {
        return NextResponse.json(
          { error: "Invalid column definition" },
          { status: 400 }
        );
      }
      validatedColumns.push({
        name: col.name.trim(),
        cellType: col.cellType,
      });
    }

    if (mode !== "ai" && mode !== "scratch") {
      return NextResponse.json(
        { error: "Mode must be 'ai' or 'scratch'" },
        { status: 400 }
      );
    }

    const table = await createTable(
      payload.userId,
      (name as string).trim(),
      typeof teamId === "string" ? teamId : undefined
    );

    const insertedColumns = await bulkAddColumns(table.id, validatedColumns);

    if (mode === "scratch") {
      const count = Math.min(
        Math.max(1, typeof rowCount === "number" ? rowCount : 10),
        MAX_ROW_COUNT
      );
      await bulkAddRows(table.id, count);

      return NextResponse.json({
        table: { ...table, permission: PERMISSION_OWNER, isOwner: true },
      });
    }

    // AI mode
    if (typeof scriptText !== "string" || !scriptText.trim()) {
      return NextResponse.json(
        { error: "Script text is required for AI mode" },
        { status: 400 }
      );
    }

    const trimmedScript = (scriptText as string).slice(0, MAX_SCRIPT_LENGTH);

    const textColumns = insertedColumns.filter((c) => c.cellType === "text");
    const textColumnNames = textColumns.map((c) => c.name);

    const generatedRows = await generateRowsFromScript({
      columnNames: textColumnNames,
      scriptText: trimmedScript,
    });

    const insertedRows = await bulkAddRows(table.id, generatedRows.length);

    const colNameToId = new Map(
      insertedColumns.map((c) => [c.name, c.id])
    );

    const cellValues: Array<{
      columnId: string;
      rowId: string;
      textContent: string;
    }> = [];

    for (let i = 0; i < generatedRows.length; i++) {
      const row = generatedRows[i];
      const rowId = insertedRows[i].id;
      for (const colName of textColumnNames) {
        const colId = colNameToId.get(colName);
        if (colId && row[colName]) {
          cellValues.push({
            columnId: colId,
            rowId,
            textContent: row[colName],
          });
        }
      }
    }

    if (cellValues.length > 0) {
      await bulkInsertCells(table.id, cellValues, payload.userId);
    }

    return NextResponse.json({
      table: { ...table, permission: PERMISSION_OWNER, isOwner: true },
    });
  } catch (error) {
    console.error("Error initializing production table:", error);
    return NextResponse.json(
      { error: "Failed to initialize table" },
      { status: 500 }
    );
  }
}
