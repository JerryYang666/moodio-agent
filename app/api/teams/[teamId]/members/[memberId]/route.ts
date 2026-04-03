import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { updateMemberRole, updateMemberTag, removeMember } from "@/lib/teams";

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
    const body = await request.json();
    const { role, tag } = body;

    const hasRole = role !== undefined;
    const hasTag = "tag" in body;

    if (!hasRole && !hasTag) {
      return NextResponse.json(
        { error: "At least one of role or tag is required" },
        { status: 400 }
      );
    }

    if (hasRole && (!role || !["admin", "member"].includes(role))) {
      return NextResponse.json(
        { error: "Valid role is required (admin or member)" },
        { status: 400 }
      );
    }

    if (hasRole) {
      await updateMemberRole(teamId, memberId, role, payload.userId);
    }

    if (hasTag) {
      await updateMemberTag(teamId, memberId, tag ?? null, payload.userId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating member:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update member" },
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
