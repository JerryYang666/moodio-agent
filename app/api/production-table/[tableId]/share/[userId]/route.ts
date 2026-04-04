import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getTablePermission } from "@/lib/production-table/permissions";
import { removeTableShare } from "@/lib/production-table/queries";
import { isOwner } from "@/lib/permissions";

type Params = { tableId: string; userId: string };

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

    const { tableId, userId } = await params;
    const perm = await getTablePermission(tableId, payload.userId);
    if (!isOwner(perm)) {
      return NextResponse.json(
        { error: "Only the owner can remove shares" },
        { status: 403 }
      );
    }

    await removeTableShare(tableId, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing table share:", error);
    return NextResponse.json(
      { error: "Failed to remove share" },
      { status: 500 }
    );
  }
}
