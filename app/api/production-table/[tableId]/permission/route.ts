import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { authorizeTopic } from "@/lib/realtime/authorize";

type Params = { tableId: string };

/**
 * GET /api/production-table/[tableId]/permission
 * Returns the calling user's permission level for this table.
 * Delegates to the shared realtime authorize helper, which also performs
 * the viewer→editor promotion when granular column/row grants exist.
 */
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
    const result = await authorizeTopic(
      `production-table:${tableId}`,
      payload.userId
    );
    if ("error" in result) {
      return NextResponse.json(
        { error: "No access" },
        { status: result.error === "bad_request" ? 400 : 403 }
      );
    }

    return NextResponse.json({ permission: result.permission });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
