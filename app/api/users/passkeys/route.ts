import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getUserPasskeys } from "@/lib/auth/passkeys";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyAccessToken(accessToken);
    if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const keys = await getUserPasskeys(payload.userId);
    
    return NextResponse.json({ passkeys: keys });
  } catch (error) {
    console.error("Error fetching passkeys:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

