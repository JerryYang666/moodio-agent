"use client";

import { Chip } from "@heroui/chip";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("video");
  const labelMap: Record<VideoStatus, string> = {
    pending: t("statusQueued"),
    processing: t("statusGenerating"),
    completed: t("statusCompleted"),
    failed: t("statusFailed"),
  };
  const shortLabelMap: Record<VideoStatus, string> = {
    pending: t("statusQueuedShort"),
    processing: t("statusGeneratingShort"),
    completed: t("statusCompletedShort"),
    failed: t("statusFailedShort"),
  };
  const label = labelMap[status];
  const shortLabel = shortLabelMap[status];

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
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{shortLabel}</span>
        </>
      ) : (
        label
      )}
    </Chip>
  );
}
