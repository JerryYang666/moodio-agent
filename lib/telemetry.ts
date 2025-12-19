import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

export async function recordEvent(
  eventType: string,
  userId: string | undefined,
  metadata: Record<string, any>,
  ipAddress?: string | null
) {
  try {
    // If ipAddress is not provided, we might be able to get it from headers() if running in request context
    // But since we are calling this from various places, it's better to pass it explicitly if possible.
    // If passed as null/undefined, we just store it as null.

    await db.insert(events).values({
      eventType,
      userId,
      metadata,
      ipAddress: ipAddress || null,
    });
  } catch (error) {
    console.error("Failed to record event:", error);
    // Fail silently to not disrupt the main flow
  }
}

export function sanitizeGeminiResponse(response: any): any {
  try {
    const sanitized = JSON.parse(JSON.stringify(response)); // Deep copy
    if (sanitized.candidates) {
      for (const candidate of sanitized.candidates) {
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              part.inlineData.data = "<REDACTED_IMAGE_DATA>";
            }
          }
        }
      }
    }
    return sanitized;
  } catch (e) {
    return { error: "Failed to sanitize response" };
  }
}

export function sanitizeOpenAIResponse(response: any): any {
  try {
    const sanitized = JSON.parse(JSON.stringify(response));
    if (sanitized.data) {
      for (const item of sanitized.data) {
        if (item.b64_json) {
          item.b64_json = "<REDACTED_IMAGE_DATA>";
        }
      }
    }
    return sanitized;
  } catch (e) {
    return { error: "Failed to sanitize response" };
  }
}
