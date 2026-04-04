import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import {
  addColumnShares,
  removeColumnShare,
} from "@/lib/production-table/queries";
import { isOwner } from "@/lib/permissions";
import type { ColumnSharePayload } from "@/lib/production-table/types";

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
        { error: "Only the owner can grant column access" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as ColumnSharePayload;
    const { columnIds, sharedWithUserId } = body;

    if (
      !Array.isArray(columnIds) ||
      columnIds.length === 0 ||
      !sharedWithUserId
    ) {
      return NextResponse.json(
        { error: "columnIds and sharedWithUserId are required" },
        { status: 400 }
      );
    }

    await addColumnShares(tableId, columnIds, sharedWithUserId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding column shares:", error);
    return NextResponse.json(
      { error: "Failed to add column shares" },
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
    const columnId = searchParams.get("columnId");
    const userId = searchParams.get("userId");

    if (!columnId || !userId) {
      return NextResponse.json(
        { error: "columnId and userId query params are required" },
        { status: 400 }
      );
    }

    await removeColumnShare(columnId, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing column share:", error);
    return NextResponse.json(
      { error: "Failed to remove column share" },
      { status: 500 }
    );
  }
}
