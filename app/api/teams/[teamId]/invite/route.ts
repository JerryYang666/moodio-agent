import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { inviteMember } from "@/lib/teams";
import { sendTeamInviteEmail } from "@/lib/auth/email";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
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
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const invitation = await inviteMember(teamId, email, payload.userId);

    const [team] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const acceptUrl = `${appUrl}/teams/accept-invite?token=${invitation.token}`;
    const inviterName =
      payload.firstName || payload.email || "A team member";
    const teamName = team?.name || "your team";

    await sendTeamInviteEmail(email, inviterName, teamName, acceptUrl);

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error: any) {
    console.error("Error inviting member:", error);
    return NextResponse.json(
      { error: error.message || "Failed to invite member" },
      { status: 400 }
    );
  }
}
