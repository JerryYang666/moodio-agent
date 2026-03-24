import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { cancelInvitation } from "@/lib/teams";

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ teamId: string; invitationId: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teamId, invitationId } = await params;
    await cancelInvitation(invitationId, teamId, payload.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error cancelling invitation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel invitation" },
      { status: 400 }
    );
  }
}
