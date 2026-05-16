"use client";

import { Chip } from "@heroui/chip";
import { Tooltip } from "@heroui/tooltip";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/dropdown";
import { useTranslations } from "next-intl";
import { CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";
import {
  REVIEW_STATUSES,
  type ReviewStatus,
} from "@/lib/desktop/types";

export function getReviewStatusColor(status: ReviewStatus) {
  switch (status) {
    case "approved":
      return "success" as const;
    case "pending":
      return "default" as const;
    case "rejected":
      return "danger" as const;
    case "needs_review":
      return "warning" as const;
  }
}

export function getReviewStatusIcon(status: ReviewStatus, size = 14) {
  switch (status) {
    case "approved":
      return <CheckCircle size={size} className="text-success" />;
    case "pending":
      return <Clock size={size} className="text-default-500" />;
    case "rejected":
      return <XCircle size={size} className="text-danger" />;
    case "needs_review":
      return <AlertCircle size={size} className="text-warning" />;
  }
}

const LABEL_KEY: Record<ReviewStatus, string> = {
  approved: "reviewStatusApproved",
  pending: "reviewStatusPending",
  rejected: "reviewStatusRejected",
  needs_review: "reviewStatusNeedsReview",
};

// Compact, locale-aware relative time ("2h ago"). Mirrors the helper in
// AssetHistoryPopover (which is file-private there) — kept tiny and local.
function formatRelativeTime(timestamp: number): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
    style: "short",
  });
  const diffSec = Math.round((timestamp - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 45) return rtf.format(0, "second");
  if (absSec < 60 * 60) return rtf.format(Math.round(diffSec / 60), "minute");
  if (absSec < 60 * 60 * 24) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (absSec < 60 * 60 * 24 * 30)
    return rtf.format(Math.round(diffSec / 86400), "day");
  if (absSec < 60 * 60 * 24 * 365)
    return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
  return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
}

function useAttribution(
  status: ReviewStatus,
  by: string | null,
  at: number | null
) {
  const t = useTranslations("desktop");
  const statusLabel = t(LABEL_KEY[status]);
  const name = by || t("reviewStatusUnknownUser");
  const main = t("reviewStatusSetBy", { status: statusLabel, name });
  const when = typeof at === "number" ? formatRelativeTime(at) : null;
  return { statusLabel, main, when };
}

interface AssetReviewTagProps {
  status: ReviewStatus;
  by?: string | null;
  at?: number | null;
}

/**
 * Read-only review badge with a hover tooltip showing who set the status and
 * when. Used for viewers / non-editable contexts.
 */
export function AssetReviewTag({ status, by = null, at = null }: AssetReviewTagProps) {
  const { statusLabel, main, when } = useAttribution(status, by, at);
  return (
    <Tooltip
      content={
        <div className="flex flex-col gap-0.5 max-w-[220px]">
          <span className="text-xs font-medium">{main}</span>
          {when && <span className="text-[10px] text-default-400">{when}</span>}
        </div>
      }
      closeDelay={0}
      placement="bottom-start"
    >
      <Chip
        size="sm"
        variant="flat"
        color={getReviewStatusColor(status)}
        startContent={getReviewStatusIcon(status)}
        classNames={{
          base: "h-5 sm:h-6 cursor-default",
          content: "text-[10px] sm:text-xs",
        }}
      >
        {statusLabel}
      </Chip>
    </Tooltip>
  );
}

interface AssetReviewTagMenuProps {
  status: ReviewStatus;
  by?: string | null;
  at?: number | null;
  onChange: (status: ReviewStatus | null) => void;
}

/**
 * Editable review badge: the chip is a dropdown trigger. The dropdown lists
 * the four statuses plus a "Clear tag" action, and shows the "set by" / time
 * attribution as a non-interactive header so it's visible while open.
 */
export function AssetReviewTagMenu({
  status,
  by = null,
  at = null,
  onChange,
}: AssetReviewTagMenuProps) {
  const t = useTranslations("desktop");
  const { statusLabel, main, when } = useAttribution(status, by, at);

  return (
    <Dropdown placement="bottom-start">
      <DropdownTrigger>
        <button
          type="button"
          aria-label={t("reviewStatus")}
          title={when ? `${main} · ${when}` : main}
          className="outline-none"
        >
          <Tooltip
            content={
              <div className="flex flex-col gap-0.5 max-w-[220px]">
                <span className="text-xs font-medium">{main}</span>
                {when && (
                  <span className="text-[10px] text-default-400">{when}</span>
                )}
              </div>
            }
            closeDelay={0}
            placement="bottom-start"
          >
            <Chip
              size="sm"
              variant="flat"
              color={getReviewStatusColor(status)}
              startContent={getReviewStatusIcon(status)}
              classNames={{
                base: "h-5 sm:h-6 cursor-pointer",
                content: "text-[10px] sm:text-xs",
              }}
            >
              {statusLabel}
            </Chip>
          </Tooltip>
        </button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t("reviewStatus")}
        onAction={(key) => {
          if (key === "__clear__") onChange(null);
          else onChange(key as ReviewStatus);
        }}
      >
        <DropdownSection showDivider title={main}>
          {REVIEW_STATUSES.map((s) => (
            <DropdownItem
              key={s}
              startContent={getReviewStatusIcon(s, 16)}
              className={s === status ? "text-foreground font-medium" : ""}
            >
              {t(LABEL_KEY[s])}
            </DropdownItem>
          ))}
        </DropdownSection>
        <DropdownItem
          key="__clear__"
          className="text-danger"
          color="danger"
        >
          {t("reviewStatusClear")}
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
