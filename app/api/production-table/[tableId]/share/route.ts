import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import { listShares, addTableShare } from "@/lib/production-table/queries";
import { isOwner, isValidSharePermission } from "@/lib/permissions";
import type { TableSharePayload } from "@/lib/production-table/types";

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
    const permission = await getTablePermission(tableId, payload.userId);
    if (!permission) {
      return NextResponse.json(
        { error: "Table not found or access denied" },
        { status: 404 }
      );
    }

    const shares = await listShares(tableId);
    return NextResponse.json(shares);
  } catch (error) {
    console.error("Error listing shares:", error);
    return NextResponse.json(
      { error: "Failed to list shares" },
      { status: 500 }
    );
  }
}

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
        { error: "Only the owner can share the table" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as TableSharePayload;
    const { sharedWithUserId, permission } = body;

    if (!sharedWithUserId || !permission) {
      return NextResponse.json(
        { error: "sharedWithUserId and permission are required" },
        { status: 400 }
      );
    }
    if (!isValidSharePermission(permission)) {
      return NextResponse.json(
        { error: "permission must be 'viewer' or 'collaborator'" },
        { status: 400 }
      );
    }

    const share = await addTableShare(tableId, sharedWithUserId, permission);
    return NextResponse.json({ share });
  } catch (error) {
    console.error("Error adding table share:", error);
    return NextResponse.json(
      { error: "Failed to share table" },
      { status: 500 }
    );
  }
}
