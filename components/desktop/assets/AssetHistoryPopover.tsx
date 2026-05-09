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

interface HistoryVersion {
  imageId: string;
  isCurrent: boolean;
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

  // Clamp anchor so the popover stays on-screen
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 1080;
  const left = Math.min(anchor.x, viewportW - POPOVER_WIDTH - 8);
  const top = Math.min(anchor.y, viewportH - POPOVER_MAX_HEIGHT - 8);

  // Preview panel sits to the left of the popover when there's room, else to the right.
  const previewOnLeft = left > PREVIEW_SIZE + 16;
  const previewLeft = previewOnLeft
    ? Math.max(8, left - PREVIEW_SIZE - 12)
    : Math.min(viewportW - PREVIEW_SIZE - 8, left + POPOVER_WIDTH + 12);
  const previewTop = Math.min(top, viewportH - PREVIEW_SIZE - 8);

  const hoveredVersion = hoveredImageId
    ? versions?.find((v) => v.imageId === hoveredImageId) ?? null
    : null;

  return (
    <>
      <div
        ref={popoverRef}
        className="fixed z-110 bg-background border border-divider rounded-xl shadow-lg flex flex-col overflow-hidden"
        style={{
          left,
          top,
          width: POPOVER_WIDTH,
          maxHeight: POPOVER_MAX_HEIGHT,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-divider shrink-0">
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
            className="text-default-500 hover:text-foreground transition-colors"
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
              : t("imageHistory.versionLabel", {
                  n: versions.length - idx,
                });
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
                  <span className="text-sm truncate">{label}</span>
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
  useEffect(() => {
    setLoaded(false);
    setSrc(mdUrl);
    triedRef.current = new Set([mdUrl]);
  }, [mdUrl]);
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-default-50">
      {!loaded && <Spinner size="sm" />}
      <img
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
