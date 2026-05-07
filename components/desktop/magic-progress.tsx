"use client";

import { Sparkles } from "lucide-react";

interface MagicProgressProps {
  /** Status line shown to the user, e.g. "Reimagining…" */
  statusText: string;
  /**
   * Whether the surface should fill its parent. Default true. The overlay
   * pins this to the asset rect so an absolute-fill is what we want.
   */
  fill?: boolean;
}

/**
 * Inline "magical" processing animation. Sized to fit its parent so the
 * caller can pin it to the target asset's screen rect. Used while
 * /api/image/edit is in flight for redraw / erase / cutout operations.
 */
export default function MagicProgress({
  statusText,
  fill = true,
}: MagicProgressProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-2",
        "pointer-events-none select-none",
        "rounded-md overflow-hidden",
        fill ? "absolute inset-0" : "",
      ].join(" ")}
    >
      {/* Shimmering gradient sweep */}
      <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-500/30 via-sky-400/30 to-emerald-400/30 animate-pulse" />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.45)_50%,transparent_70%)] bg-[length:200%_100%] animate-[shimmer_2.2s_linear_infinite]" />
      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>

      <div className="relative z-10 flex flex-col items-center gap-2 rounded-lg bg-background/80 backdrop-blur px-4 py-2 shadow-md">
        <Sparkles
          size={28}
          className="text-fuchsia-500 animate-spin [animation-duration:3s]"
        />
        <span className="text-sm font-medium text-foreground">{statusText}</span>
      </div>
    </div>
  );
}
