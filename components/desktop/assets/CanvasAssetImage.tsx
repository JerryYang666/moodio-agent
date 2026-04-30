"use client";

import { useEffect, useRef, useState } from "react";
import type { EnrichedDesktopAsset } from "./types";

type Tier = "sm" | "md" | "full";

const TIER_RANK: Record<Tier, number> = { sm: 0, md: 1, full: 2 };
const SM_MAX_DEVICE_PX = 384;
const MD_MAX_DEVICE_PX = 1024;
const UPGRADE_DEBOUNCE_MS = 200;
const FADE_MS = 150;

function selectTier(displayedDevicePx: number): Tier {
  if (displayedDevicePx <= SM_MAX_DEVICE_PX) return "sm";
  if (displayedDevicePx <= MD_MAX_DEVICE_PX) return "md";
  return "full";
}

interface Props {
  asset: EnrichedDesktopAsset;
  containerWidth: number;
  zoom: number;
  alt: string;
  onImageLoad: (
    assetId: string,
    naturalWidth: number,
    naturalHeight: number
  ) => void;
  className?: string;
}

export default function CanvasAssetImage({
  asset,
  containerWidth,
  zoom,
  alt,
  onImageLoad,
  className,
}: Props) {
  const src = asset.imageUrl;
  const smUrl = asset.thumbnailSmUrl;
  const mdUrl = asset.thumbnailMdUrl;
  const fullUrl = src;

  const isBlob = !!src && src.startsWith("blob:");
  const hasTiers = !!smUrl && !isBlob;

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const displayedDevicePx = containerWidth * zoom * dpr;
  const targetTier: Tier = selectTier(displayedDevicePx);

  const [committedTier, setCommittedTier] = useState<Tier>(targetTier);
  const loadedTiersRef = useRef<Set<Tier>>(new Set());
  const [, forceRender] = useState(0);
  const hasReportedDimsRef = useRef(false);

  useEffect(() => {
    if (!hasTiers) return;
    if (targetTier === committedTier) return;
    const t = setTimeout(() => {
      setCommittedTier((prev) =>
        TIER_RANK[targetTier] > TIER_RANK[prev] ? targetTier : prev
      );
    }, UPGRADE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [targetTier, committedTier, hasTiers]);

  if (!src) {
    return <div className="w-full h-full bg-default-200 animate-pulse" />;
  }

  // Single-image path: optimistic blob uploads, public assets without
  // Lambda-generated thumbnails, or any asset where thumbnails aren't available.
  if (!hasTiers) {
    return (
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={className ?? "w-full h-full object-contain"}
        onLoad={(e) => {
          if (hasReportedDimsRef.current) return;
          hasReportedDimsRef.current = true;
          const img = e.currentTarget;
          onImageLoad(asset.id, img.naturalWidth, img.naturalHeight);
        }}
      />
    );
  }

  const handleTierLoad = (
    tier: Tier,
    e: React.SyntheticEvent<HTMLImageElement>
  ) => {
    loadedTiersRef.current.add(tier);
    forceRender((n) => n + 1);
    if (!hasReportedDimsRef.current) {
      hasReportedDimsRef.current = true;
      const img = e.currentTarget;
      onImageLoad(asset.id, img.naturalWidth, img.naturalHeight);
    }
  };

  const handleTierError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    if (fullUrl && target.src !== fullUrl) {
      target.src = fullUrl;
    }
  };

  const shouldRenderMd =
    TIER_RANK[committedTier] >= TIER_RANK["md"] ||
    loadedTiersRef.current.has("md");
  const shouldRenderFull =
    TIER_RANK[committedTier] >= TIER_RANK["full"] ||
    loadedTiersRef.current.has("full");

  const baseClass = className ?? "w-full h-full object-contain";

  return (
    <div className="relative w-full h-full">
      <img
        key="sm"
        src={smUrl!}
        alt={alt}
        draggable={false}
        className={`absolute inset-0 ${baseClass}`}
        onLoad={(e) => handleTierLoad("sm", e)}
        onError={handleTierError}
      />
      {shouldRenderMd && mdUrl && (
        <img
          key="md"
          src={mdUrl}
          alt={alt}
          draggable={false}
          className={`absolute inset-0 ${baseClass}`}
          style={{
            opacity: loadedTiersRef.current.has("md") ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease-out`,
          }}
          onLoad={(e) => handleTierLoad("md", e)}
          onError={handleTierError}
        />
      )}
      {shouldRenderFull && fullUrl && (
        <img
          key="full"
          src={fullUrl}
          alt={alt}
          draggable={false}
          className={`absolute inset-0 ${baseClass}`}
          style={{
            opacity: loadedTiersRef.current.has("full") ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease-out`,
          }}
          onLoad={(e) => handleTierLoad("full", e)}
          onError={(e) => {
            // full failed; nothing to fall back to (sm/md already shown).
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}
