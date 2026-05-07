"use client";

import { useCallback, useRef, useState } from "react";
import { ASSET_DRAG_MIME } from "./use-asset-drag-autoscroll";

export interface AssetDropPayload {
  assetId: string;
  [key: string]: unknown;
}

export function parseAssetDrop(
  e: React.DragEvent | DragEvent
): AssetDropPayload | null {
  try {
    const raw = e.dataTransfer?.getData(ASSET_DRAG_MIME);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.assetId) {
          return parsed as AssetDropPayload;
        }
      } catch {
        // Not JSON — treat raw value as the asset id (current asset-card payload).
        return { assetId: raw };
      }
    }
    const fallback = e.dataTransfer?.getData("text/plain");
    if (fallback && !(e.dataTransfer?.files?.length)) {
      return { assetId: fallback };
    }
  } catch {
    return null;
  }
  return null;
}

interface UseAssetDropZoneOptions {
  onDrop: (payload: AssetDropPayload, e: React.DragEvent) => void;
  disabled?: boolean;
}

export function useAssetDropZone({ onDrop, disabled = false }: UseAssetDropZoneOptions) {
  const [isOver, setIsOver] = useState(false);
  const counterRef = useRef(0);

  const hasAssetType = (e: React.DragEvent) =>
    e.dataTransfer?.types?.includes(ASSET_DRAG_MIME) ?? false;

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!hasAssetType(e)) return;
      e.preventDefault();
      e.stopPropagation();
      counterRef.current++;
      if (counterRef.current === 1) setIsOver(true);
    },
    [disabled]
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!hasAssetType(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    },
    [disabled]
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!hasAssetType(e)) return;
      counterRef.current = Math.max(0, counterRef.current - 1);
      if (counterRef.current === 0) setIsOver(false);
    },
    [disabled]
  );

  const onDropHandler = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!hasAssetType(e)) return;
      e.preventDefault();
      e.stopPropagation();
      counterRef.current = 0;
      setIsOver(false);
      const payload = parseAssetDrop(e);
      if (payload) onDrop(payload, e);
    },
    [disabled, onDrop]
  );

  return {
    isOver,
    dropProps: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop: onDropHandler,
    },
  };
}
