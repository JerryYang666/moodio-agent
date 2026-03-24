import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, setAccessTokenCookie } from "@/lib/auth/cookies";
import { verifyAccessToken, generateAccessToken } from "@/lib/auth/jwt";
import { getUserTeams, createTeam, getUserTeamMemberships } from "@/lib/teams";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const teams = await getUserTeams(payload.userId);
    return NextResponse.json({ teams });
  } catch (error: any) {
    console.error("Error fetching teams:", error);
    return NextResponse.json(
      { error: "Failed to fetch teams" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name } = await request.json();
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Team name is required" },
        { status: 400 }
      );
    }

    const team = await createTeam(payload.userId, name.trim());

    // Refresh the JWT so the new team membership is immediately available
    const teamMemberships = await getUserTeamMemberships(payload.userId);
    const newAccessToken = await generateAccessToken(
      payload.userId,
      payload.email,
      payload.roles,
      payload.firstName,
      payload.lastName,
      teamMemberships
    );

    const response = NextResponse.json({ team }, { status: 201 });
    setAccessTokenCookie(response, newAccessToken);
    return response;
  } catch (error: any) {
    console.error("Error creating team:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create team" },
      { status: 500 }
    );
  }
}
