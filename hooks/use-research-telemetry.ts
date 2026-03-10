import { useFeatureFlag } from "@/lib/feature-flags";
import {
  trackResearchEvent,
  beaconResearchEvent,
  type ClientResearchEventData,
} from "@/lib/research-telemetry-client";
import { useCallback } from "react";

export function useResearchTelemetry() {
  const enabled = useFeatureFlag<boolean>("res_telemetry") ?? false;

  const track = useCallback(
    (data: ClientResearchEventData) => {
      if (!enabled) return;
      trackResearchEvent(data);
    },
    [enabled]
  );

  const beacon = useCallback(
    (data: ClientResearchEventData) => {
      if (!enabled) return false;
      return beaconResearchEvent(data);
    },
    [enabled]
  );

  return { track, beacon, enabled };
}
