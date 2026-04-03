import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getMemberRole, getTeamMembersLightweight } from "@/lib/teams";

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

    const members = await getTeamMembersLightweight(teamId);
    return NextResponse.json({ members });
  } catch (error: any) {
    console.error("Error fetching team members:", error);
    return NextResponse.json(
      { error: "Failed to fetch team members" },
      { status: 500 }
    );
  }
}
