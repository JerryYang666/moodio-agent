import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";

export async function GET(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const FAL_KEY = process.env.FAL_ADMIN_KEY;

  if (!FAL_KEY) {
    return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
  }

  try {
    const searchParams = request.nextUrl.searchParams.toString();
    
    // Try the primary usage endpoint first
    let url = `https://api.fal.ai/v1/models/usage?${searchParams}`;
    
    console.log(`[Fal Usage] Fetching from: ${url}`);
    
    let response = await fetch(url, {
        headers: {
            "Authorization": `Key ${FAL_KEY}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Fal API Error: ${response.status} ${text}`);
        return NextResponse.json({ 
            error: `Fal API Error: ${response.status}`, 
            details: text,
            url 
        }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching Fal usage:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
