"use client";

import { Chip } from "@heroui/chip";
import { Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

export type VideoStatus = "pending" | "processing" | "completed" | "failed";

interface VideoStatusChipProps {
  status: VideoStatus;
  /** Show abbreviated text on mobile (default: true) */
  responsive?: boolean;
}

export function getStatusIcon(status: VideoStatus) {
  switch (status) {
    case "pending":
      return <Clock size={14} className="text-default-400" />;
    case "processing":
      return <Loader2 size={14} className="text-primary animate-spin" />;
    case "completed":
      return <CheckCircle size={14} className="text-success" />;
    case "failed":
      return <XCircle size={14} className="text-danger" />;
  }
}

export function getStatusColor(status: VideoStatus) {
  switch (status) {
    case "pending":
      return "default" as const;
    case "processing":
      return "primary" as const;
    case "completed":
      return "success" as const;
    case "failed":
      return "danger" as const;
  }
}

export default function VideoStatusChip({
  status,
  responsive = true,
}: VideoStatusChipProps) {
  return (
    <Chip
      size="sm"
      variant="flat"
      color={getStatusColor(status)}
      startContent={getStatusIcon(status)}
      classNames={{
        base: "h-5 sm:h-6",
        content: "text-[10px] sm:text-xs",
      }}
    >
      {responsive ? (
        <>
          <span className="hidden sm:inline">{status}</span>
          <span className="sm:hidden">{status.slice(0, 4)}</span>
        </>
      ) : (
        status
      )}
    </Chip>
  );
}
