import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, setAccessTokenCookie } from "@/lib/auth/cookies";
import { verifyAccessToken, generateAccessToken } from "@/lib/auth/jwt";
import { acceptInvitation, getUserTeamMemberships } from "@/lib/teams";

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Invitation token is required" },
        { status: 400 }
      );
    }

    const result = await acceptInvitation(token, payload.userId);

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

    const response = NextResponse.json(result);
    setAccessTokenCookie(response, newAccessToken);
    return response;
  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to accept invitation" },
      { status: 400 }
    );
  }
}
