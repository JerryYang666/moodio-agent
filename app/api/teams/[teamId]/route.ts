import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  getTeamWithMembers,
  getMemberRole,
  updateTeamName,
  deleteTeam,
} from "@/lib/teams";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teamId } = await params;

    const role = await getMemberRole(teamId, payload.userId);
    if (!role) {
      return NextResponse.json(
        { error: "You are not a member of this team" },
        { status: 403 }
      );
    }

    const team = await getTeamWithMembers(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({ team });
  } catch (error: any) {
    console.error("Error fetching team:", error);
    return NextResponse.json(
      { error: "Failed to fetch team" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teamId } = await params;
    const { name } = await request.json();

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Team name is required" },
        { status: 400 }
      );
    }

    const updated = await updateTeamName(teamId, name.trim(), payload.userId);
    return NextResponse.json({ team: updated });
  } catch (error: any) {
    console.error("Error updating team:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update team" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teamId } = await params;
    await deleteTeam(teamId, payload.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting team:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete team" },
      { status: 400 }
    );
  }
}
