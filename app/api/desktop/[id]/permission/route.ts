import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { authorizeTopic } from "@/lib/realtime/authorize";

/**
 * GET /api/desktop/[id]/permission
 * Returns the calling user's permission level for this desktop.
 * Delegates to the shared realtime authorize helper so there's one source
 * of truth for permission resolution.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    const result = await authorizeTopic(`desktop:${id}`, payload.userId);
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
