import type { ResearchEventType } from "@/lib/research-telemetry";

export interface ClientResearchEventData {
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
 * Send a research telemetry event from the frontend.
 * Fire-and-forget — never blocks UI.
 */
export function trackResearchEvent(data: ClientResearchEventData): void {
  fetch("/api/research-telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).catch((err) => {
    console.error("[ResearchTelemetry] Failed to send event:", err);
  });
}

/**
 * Send a research telemetry event via sendBeacon (for page unload scenarios).
 * Returns true if the beacon was successfully queued.
 */
export function beaconResearchEvent(data: ClientResearchEventData): boolean {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    trackResearchEvent(data);
    return true;
  }
  return navigator.sendBeacon(
    "/api/research-telemetry",
    new Blob([JSON.stringify(data)], { type: "application/json" })
  );
}
