import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission, getEditableGrants } from "@/lib/production-table/permissions";
import {
  getEnrichedTable,
  renameTable,
  deleteTable,
  getTableById,
} from "@/lib/production-table/queries";
import { hasWriteAccess, isOwner } from "@/lib/permissions";

type Params = { tableId: string };

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
    const table = await getEnrichedTable(tableId, payload.userId);
    if (!table) {
      return NextResponse.json(
        { error: "Table not found or access denied" },
        { status: 404 }
      );
    }

    const editableGrants = await getEditableGrants(tableId, payload.userId);

    return NextResponse.json({ table, editableGrants });
  } catch (error) {
    console.error("Error fetching production table:", error);
    return NextResponse.json(
      { error: "Failed to fetch table" },
      { status: 500 }
    );
  }
}

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
    const { name } = body as { name?: unknown };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Table name is required" },
        { status: 400 }
      );
    }

    const table = await renameTable(tableId, name.trim());
    return NextResponse.json({ table });
  } catch (error) {
    console.error("Error updating production table:", error);
    return NextResponse.json(
      { error: "Failed to update table" },
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

    const { tableId } = await params;
    const permission = await getTablePermission(tableId, payload.userId);
    if (!isOwner(permission)) {
      return NextResponse.json(
        { error: "Only the owner can delete the table" },
        { status: 403 }
      );
    }

    await deleteTable(tableId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting production table:", error);
    return NextResponse.json(
      { error: "Failed to delete table" },
      { status: 500 }
    );
  }
}
