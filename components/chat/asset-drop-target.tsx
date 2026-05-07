"use client";

import { ReactNode } from "react";
import clsx from "clsx";
import {
  AssetDropPayload,
  useAssetDropZone,
} from "@/hooks/use-asset-drop-zone";

interface AssetDropTargetProps {
  onAssetDrop: (payload: AssetDropPayload) => void;
  disabled?: boolean;
  className?: string;
  /** Extra classes applied while a draggable asset is hovering this zone. */
  activeClassName?: string;
  children: ReactNode;
}

/**
 * Wraps a chat-input drop slot so that drops of internal asset cards land in
 * THIS zone instead of bubbling up to the outer chat-input drop handler.
 * Applies a primary-colored ring while a draggable asset is over it.
 */
export function AssetDropTarget({
  onAssetDrop,
  disabled,
  className,
  activeClassName = "ring-2 ring-primary ring-offset-1 ring-offset-background rounded-lg",
  children,
}: AssetDropTargetProps) {
  const { isOver, dropProps } = useAssetDropZone({
    onDrop: (payload) => onAssetDrop(payload),
    disabled,
  });

  return (
    <div
      {...dropProps}
      className={clsx(
        "transition-shadow",
        className,
        isOver && !disabled && activeClassName
      )}
    >
      {children}
    </div>
  );
}
