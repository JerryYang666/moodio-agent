import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { isFeatureFlagEnabled } from "@/lib/feature-flags/server";
import {
  recordResearchEvent,
  type ResearchEventType,
} from "@/lib/research-telemetry";

const ALLOWED_EVENT_TYPES = new Set<ResearchEventType>([
  "image_selected",
  "image_downloaded",
  "image_saved_to_collection",
  "image_shared",
  "video_generation_started",
  "video_downloaded",
  "video_saved_to_collection",
  "reference_image_added",
  "chat_forked",
  "session_end",
  "image_hover_preview",
  "canvas_item_added",
  "timeline_clip_added",
  "video_export_started",
  "image_detail_viewed",
  "suggestion_clicked",
  "video_playback_started",
  "canvas_item_removed",
  "timeline_clip_removed",
]);

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

    const enabled = await isFeatureFlagEnabled(payload.userId, "res_telemetry");
    if (!enabled) {
      return NextResponse.json({ ok: true });
    }

    const contentType = request.headers.get("content-type") || "";
    let body: any;

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      // sendBeacon may send as text/plain with JSON body
      const text = await request.text();
      body = JSON.parse(text);
    }

    const { eventType } = body;

    if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType as ResearchEventType)) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    // Fire-and-forget: never block the response on DB writes
    void recordResearchEvent({
      userId: payload.userId,
      chatId: body.chatId,
      sessionId: body.sessionId,
      eventType: eventType as ResearchEventType,
      turnIndex: body.turnIndex,
      imageId: body.imageId,
      imagePosition: body.imagePosition,
      variantId: body.variantId,
      metadata: body.metadata,
    }).catch((err) => {
      console.error("[ResearchTelemetry] Failed to record event:", err);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ResearchTelemetry] API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
