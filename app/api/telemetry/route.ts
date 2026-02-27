import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { recordEvent } from "@/lib/telemetry";

const ALLOWED_EVENT_TYPES = new Set(["retrieval_search"]);

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { eventType, metadata } = body;

    if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;

    await recordEvent(eventType, payload.userId, metadata ?? {}, ipAddress);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telemetry API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
