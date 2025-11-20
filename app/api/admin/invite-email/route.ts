import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { sendGeneralInviteEmail } from "@/lib/auth/email";
import { waitUntil } from "@vercel/functions";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { emails } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "Emails list is required" }, { status: 400 });
    }

    // Filter invalid emails roughly
    const validEmails = emails.filter(email => 
      typeof email === "string" && email.includes("@")
    );

    if (validEmails.length === 0) {
       return NextResponse.json({ error: "No valid emails provided" }, { status: 400 });
    }

    // Send BCC email
    waitUntil(sendGeneralInviteEmail(validEmails));

    return NextResponse.json({
      success: true,
      count: validEmails.length,
      message: `Invitation sent to ${validEmails.length} recipients`
    });

  } catch (error) {
    console.error("Error in invite-email:", error);
    return NextResponse.json({ error: "Failed to send invitations" }, { status: 500 });
  }
}

