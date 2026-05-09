"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { X } from "lucide-react";
import type { ImageHistoryOperation } from "@/lib/desktop/types";

interface HistoryVersion {
  imageId: string;
  isCurrent: boolean;
  operation: ImageHistoryOperation | null;
  timestamp: number | null;
  thumbnailSmUrl: string;
  thumbnailMdUrl: string;
  imageUrl: string;
}

interface Props {
  desktopId: string;
  assetId: string;
  /** Screen-space coordinates to anchor the popover at (typically the cursor position). */
  anchor: { x: number; y: number };
  onClose: () => void;
  onRestore: (version: { imageId: string; imageUrl: string }) => void;
  canRestore: boolean;
}

const HOVER_DELAY_MS = 150;
const POPOVER_WIDTH = 280;
const POPOVER_MAX_HEIGHT = 400;
const PREVIEW_SIZE = 400;

export default function AssetHistoryPopover({
  desktopId,
  assetId,
  anchor,
  onClose,
  onRestore,
  canRestore,
}: Props) {
  const t = useTranslations("desktop");
  const [versions, setVersions] = useState<HistoryVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<HistoryVersion | null>(
    null
  );
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/desktop/${desktopId}/assets/${assetId}/image-history`
        );
        if (!res.ok) {
          if (!cancelled) setError(t("imageHistory.loadFailed"));
          return;
        }
        const data = (await res.json()) as { versions: HistoryVersion[] };
        if (!cancelled) setVersions(data.versions);
      } catch {
        if (!cancelled) setError(t("imageHistory.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [desktopId, assetId, t]);

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (confirmTarget) return; // modal handles its own dismissal
      const el = popoverRef.current;
      if (el && !el.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, confirmTarget]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmTarget) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, confirmTarget]);

  const handleRowEnter = useCallback((imageId: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredImageId(imageId);
    }, HOVER_DELAY_MS);
  }, []);

  const handleRowLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredImageId(null);
  }, []);

  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    },
    []
  );

  // Clamp anchor so the popover stays on-screen, then let the user drag it
  // around via the header. Position state lives here so both the popover
  // itself and the hover-preview (which is anchored relative to the popover)
  // track in sync.
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 1080;
  const [pos, setPos] = useState(() => ({
    x: Math.max(8, Math.min(anchor.x, viewportW - POPOVER_WIDTH - 8)),
    y: Math.max(8, Math.min(anchor.y, viewportH - POPOVER_MAX_HEIGHT - 8)),
  }));
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Let the close button handle its own click
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      e.stopPropagation();
      const el = popoverRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      dragOffsetRef.current = {
        dx: e.clientX - rect.left,
        dy: e.clientY - rect.top,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handleHeaderPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const off = dragOffsetRef.current;
      if (!off) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({
        x: Math.max(8, Math.min(e.clientX - off.dx, vw - POPOVER_WIDTH - 8)),
        y: Math.max(8, Math.min(e.clientY - off.dy, vh - 48)),
      });
    },
    []
  );

  const handleHeaderPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragOffsetRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer may have already been released
      }
    },
    []
  );

  // Preview panel sits to the left of the popover when there's room, else to the right.
  const previewOnLeft = pos.x > PREVIEW_SIZE + 16;
  const previewLeft = previewOnLeft
    ? Math.max(8, pos.x - PREVIEW_SIZE - 12)
    : Math.min(viewportW - PREVIEW_SIZE - 8, pos.x + POPOVER_WIDTH + 12);
  const previewTop = Math.min(pos.y, viewportH - PREVIEW_SIZE - 8);

  const hoveredVersion = hoveredImageId
    ? versions?.find((v) => v.imageId === hoveredImageId) ?? null
    : null;

  return (
    <>
      <div
        ref={popoverRef}
        className="fixed z-110 bg-background border border-divider rounded-xl shadow-lg flex flex-col overflow-hidden"
        style={{
          left: pos.x,
          top: pos.y,
          width: POPOVER_WIDTH,
          maxHeight: POPOVER_MAX_HEIGHT,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-3 py-2 border-b border-divider shrink-0 select-none ${
            dragOffsetRef.current ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          onPointerCancel={handleHeaderPointerUp}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">
              {t("imageHistory.title")}
            </span>
            {versions && (
              <span className="text-xs text-default-500">
                {t("imageHistory.versionCount", { count: versions.length })}
              </span>
            )}
          </div>
          <button
            aria-label={t("imageHistory.close")}
            className="text-default-500 hover:text-foreground transition-colors cursor-pointer"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {versions === null && !error && (
            <div className="flex items-center justify-center py-6">
              <Spinner size="sm" />
            </div>
          )}
          {error && (
            <div className="px-3 py-4 text-sm text-danger">{error}</div>
          )}
          {versions && versions.length === 0 && (
            <div className="px-3 py-4 text-sm text-default-500">
              {t("imageHistory.empty")}
            </div>
          )}
          {versions?.map((v, idx) => {
            const label = v.isCurrent
              ? t("imageHistory.currentLabel")
              : v.operation
                ? t(`imageHistory.op.${v.operation}`)
                : t("imageHistory.op.unknown");
            const timeLabel =
              !v.isCurrent && v.timestamp
                ? formatRelativeTime(v.timestamp)
                : null;
            const fallbackLabel = v.isCurrent
              ? null
              : t("imageHistory.versionLabel", { n: versions.length - idx });
            const isClickable = !v.isCurrent && canRestore;
            return (
              <button
                key={v.imageId}
                disabled={!isClickable}
                onMouseEnter={() => handleRowEnter(v.imageId)}
                onMouseLeave={handleRowLeave}
                onClick={
                  isClickable
                    ? () => {
                        setConfirmTarget(v);
                        setHoveredImageId(null);
                      }
                    : undefined
                }
                className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                  v.isCurrent ? "bg-default-50" : ""
                } ${
                  isClickable
                    ? "hover:bg-default-100 cursor-pointer"
                    : "cursor-default"
                }`}
              >
                <HistoryThumbnail
                  smUrl={v.thumbnailSmUrl}
                  mdUrl={v.thumbnailMdUrl}
                  fullUrl={v.imageUrl}
                  alt={label}
                />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span
                    className="text-sm truncate"
                    title={
                      !v.isCurrent && v.timestamp
                        ? new Date(v.timestamp).toLocaleString()
                        : undefined
                    }
                  >
                    {label}
                    {timeLabel && (
                      <span className="text-default-500">
                        {" · "}
                        {timeLabel}
                      </span>
                    )}
                    {!v.isCurrent && !timeLabel && fallbackLabel && (
                      <span className="text-default-500">
                        {" · "}
                        {fallbackLabel}
                      </span>
                    )}
                  </span>
                  {v.isCurrent && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-100 text-primary-700">
                      {t("imageHistory.currentBadge")}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {hoveredVersion && (
        <div
          className="fixed z-110 pointer-events-none bg-background border border-divider rounded-xl shadow-xl overflow-hidden"
          style={{
            left: previewLeft,
            top: previewTop,
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
          }}
        >
          <HistoryPreview
            mdUrl={hoveredVersion.thumbnailMdUrl}
            fullUrl={hoveredVersion.imageUrl}
          />
        </div>
      )}

      {confirmTarget && (
        <Modal
          isOpen
          onOpenChange={(open) => {
            if (!open) setConfirmTarget(null);
          }}
          size="sm"
        >
          <ModalContent>
            {(close) => (
              <>
                <ModalHeader>{t("imageHistory.restoreTitle")}</ModalHeader>
                <ModalBody>
                  <p className="text-sm text-default-600">
                    {t("imageHistory.restoreBody")}
                  </p>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={close}>
                    {t("imageHistory.cancel")}
                  </Button>
                  <Button
                    color="primary"
                    onPress={() => {
                      onRestore({
                        imageId: confirmTarget.imageId,
                        imageUrl: confirmTarget.imageUrl,
                      });
                      setConfirmTarget(null);
                      onClose();
                    }}
                  >
                    {t("imageHistory.restore")}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      )}
    </>
  );
}

function HistoryThumbnail({
  smUrl,
  mdUrl,
  fullUrl,
  alt,
}: {
  smUrl: string;
  mdUrl: string;
  fullUrl: string;
  alt: string;
}) {
  const [src, setSrc] = useState(smUrl);
  const triedRef = useRef<Set<string>>(new Set([smUrl]));
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className="w-12 h-12 rounded object-cover bg-default-100 shrink-0"
      onError={() => {
        if (!triedRef.current.has(mdUrl)) {
          triedRef.current.add(mdUrl);
          setSrc(mdUrl);
          return;
        }
        if (!triedRef.current.has(fullUrl)) {
          triedRef.current.add(fullUrl);
          setSrc(fullUrl);
        }
      }}
    />
  );
}

function HistoryPreview({
  mdUrl,
  fullUrl,
}: {
  mdUrl: string;
  fullUrl: string;
}) {
  const [src, setSrc] = useState(mdUrl);
  const [loaded, setLoaded] = useState(false);
  const triedRef = useRef<Set<string>>(new Set([mdUrl]));
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setLoaded(false);
    setSrc(mdUrl);
    triedRef.current = new Set([mdUrl]);
  }, [mdUrl]);
  // When the image is already in the browser cache, the native `load` event
  // can fire before React attaches our `onLoad` handler. The handler never
  // runs and the spinner spins forever. Check `complete` after the src
  // changes and flip `loaded` ourselves in that case.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-default-50">
      {!loaded && <Spinner size="sm" />}
      <img
        ref={imgRef}
        src={src}
        draggable={false}
        alt=""
        className="absolute inset-0 w-full h-full object-contain"
        style={{ opacity: loaded ? 1 : 0, transition: "opacity 120ms ease-out" }}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!triedRef.current.has(fullUrl)) {
            triedRef.current.add(fullUrl);
            setSrc(fullUrl);
          }
        }}
      />
    </div>
  );
}

// Compact relative time ("just now", "2h ago", "3d ago"). Uses
// Intl.RelativeTimeFormat so it follows the browser locale without needing
// message-file entries for every unit.
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
