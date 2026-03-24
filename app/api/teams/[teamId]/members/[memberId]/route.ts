import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { updateMemberRole, removeMember } from "@/lib/teams";

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ teamId: string; memberId: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teamId, memberId } = await params;
    const { role } = await request.json();

    if (!role || !["admin", "member"].includes(role)) {
      return NextResponse.json(
        { error: "Valid role is required (admin or member)" },
        { status: 400 }
      );
    }

    await updateMemberRole(teamId, memberId, role, payload.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating member role:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update member role" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ teamId: string; memberId: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teamId, memberId } = await params;
    await removeMember(teamId, memberId, payload.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: error.message || "Failed to remove member" },
      { status: 400 }
    );
  }
}
