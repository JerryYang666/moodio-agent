import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import { addRowShares, removeRowShare } from "@/lib/production-table/queries";
import { isOwner } from "@/lib/permissions";
import type { RowSharePayload } from "@/lib/production-table/types";

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
    const perm = await getTablePermission(tableId, payload.userId);
    if (!isOwner(perm)) {
      return NextResponse.json(
        { error: "Only the owner can grant row access" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as RowSharePayload;
    const { rowIds, sharedWithUserId } = body;

    if (!Array.isArray(rowIds) || rowIds.length === 0 || !sharedWithUserId) {
      return NextResponse.json(
        { error: "rowIds and sharedWithUserId are required" },
        { status: 400 }
      );
    }

    await addRowShares(tableId, rowIds, sharedWithUserId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding row shares:", error);
    return NextResponse.json(
      { error: "Failed to add row shares" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rowId = searchParams.get("rowId");
    const userId = searchParams.get("userId");

    if (!rowId || !userId) {
      return NextResponse.json(
        { error: "rowId and userId query params are required" },
        { status: 400 }
      );
    }

    await removeRowShare(rowId, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing row share:", error);
    return NextResponse.json(
      { error: "Failed to remove row share" },
      { status: 500 }
    );
  }
}
