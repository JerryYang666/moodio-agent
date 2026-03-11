import { db } from "@/lib/db";
import { researchEvents } from "@/lib/db/schema";

export type ResearchEventType =
  | "image_selected"
  | "image_downloaded"
  | "image_saved_to_collection"
  | "image_shared"
  | "video_generation_started"
  | "video_downloaded"
  | "video_saved_to_collection"
  | "reference_image_added"
  | "chat_forked"
  | "session_end";

export interface ResearchEventData {
  userId: string;
  chatId?: string;
  sessionId?: string;
  eventType: ResearchEventType;
  turnIndex?: number;
  imageId?: string;
  imagePosition?: number;
  variantId?: string;
  metadata?: Record<string, any>;
}

/**
 * Record a research telemetry event. Fails silently — never blocks the main flow.
 */
export async function recordResearchEvent(
  data: ResearchEventData
): Promise<void> {
  try {
    await db.insert(researchEvents).values({
      userId: data.userId,
      chatId: data.chatId ?? null,
      sessionId: data.sessionId ?? data.chatId ?? null,
      eventType: data.eventType,
      turnIndex: data.turnIndex ?? null,
      imageId: data.imageId ?? null,
      imagePosition: data.imagePosition ?? null,
      variantId: data.variantId ?? null,
      metadata: data.metadata ?? {},
    });
  } catch (error) {
    console.error("[ResearchTelemetry] Failed to record event:", error);
  }
}
