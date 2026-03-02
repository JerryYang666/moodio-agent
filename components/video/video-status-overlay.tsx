"use client";

import { Loader2, Clock, XCircle } from "lucide-react";
import type { VideoGenerationStatus } from "@/components/video-provider";

interface VideoStatusOverlayProps {
  status: VideoGenerationStatus;
  /** Icon size in px (default 24) */
  iconSize?: number;
  /** Additional responsive classes for the icon (e.g. "sm:w-8 sm:h-8") */
  iconClassName?: string;
  /** Label to show for "processing". Pass `null` to hide. */
  processingLabel?: string | null;
  /** Label to show for "pending". Pass `null` to hide. */
  pendingLabel?: string | null;
  /** Label to show for "failed". Pass `null` to hide. */
  failedLabel?: string | null;
}

export default function VideoStatusOverlay({
  status,
  iconSize = 24,
  iconClassName = "sm:w-8 sm:h-8",
  processingLabel = "Generating",
  pendingLabel = "Queued",
  failedLabel = "Failed",
}: VideoStatusOverlayProps) {
  if (status === "completed") return null;

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
      <div className="text-center">
        {status === "processing" && (
          <>
            <Loader2
              size={iconSize}
              className={`text-white animate-spin mx-auto ${processingLabel !== null ? "mb-1 sm:mb-2" : ""} ${iconClassName}`}
            />
            {processingLabel !== null && (
              <span className="text-white text-xs sm:text-sm">{processingLabel}</span>
            )}
          </>
        )}
        {status === "pending" && (
          <>
            <Clock
              size={iconSize}
              className={`text-white mx-auto ${pendingLabel !== null ? "mb-1 sm:mb-2" : ""} ${iconClassName}`}
            />
            {pendingLabel !== null && (
              <span className="text-white text-xs sm:text-sm">{pendingLabel}</span>
            )}
          </>
        )}
        {status === "failed" && (
          <>
            <XCircle
              size={iconSize}
              className={`text-danger mx-auto ${failedLabel !== null ? "mb-1 sm:mb-2" : ""} ${iconClassName}`}
            />
            {failedLabel !== null && (
              <span className="text-white text-xs sm:text-sm">{failedLabel}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
