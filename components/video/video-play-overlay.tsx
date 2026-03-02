"use client";

import { Play } from "lucide-react";

interface VideoPlayOverlayProps {
  /** Icon size in px (default 20) */
  iconSize?: number;
  /** Additional CSS classes on the wrapper */
  className?: string;
}

export default function VideoPlayOverlay({
  iconSize = 20,
  className,
}: VideoPlayOverlayProps) {
  return (
    <div
      className={
        className ??
        "absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 sm:transition-opacity"
      }
    >
      <div className="bg-black/50 rounded-full p-2 sm:p-3">
        <Play size={iconSize} className="sm:w-6 sm:h-6 text-white" fill="white" />
      </div>
    </div>
  );
}
