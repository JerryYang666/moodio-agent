import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { canEditCell, getTablePermission } from "@/lib/production-table/permissions";
import { addMediaAsset } from "@/lib/production-table/queries";
import type { MediaAssetRef } from "@/lib/production-table/types";

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

    const tablePerm = await getTablePermission(tableId, payload.userId);
    if (!tablePerm) {
      return NextResponse.json(
        { error: "Table not found or access denied" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { columnId, rowId, asset } = body as {
      columnId: string;
      rowId: string;
      asset: MediaAssetRef;
    };

    if (!columnId || !rowId || !asset?.assetId || !asset?.imageId) {
      return NextResponse.json(
        { error: "columnId, rowId, and asset (with assetId, imageId) are required" },
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

    const cell = await addMediaAsset(tableId, columnId, rowId, asset, payload.userId);
    return NextResponse.json({ cell });
  } catch (error) {
    console.error("Error adding media asset:", error);
    return NextResponse.json(
      { error: "Failed to add media asset" },
      { status: 500 }
    );
  }
}
