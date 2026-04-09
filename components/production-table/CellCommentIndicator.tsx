"use client";

import React, { memo, useState, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { CellComment } from "@/lib/production-table/types";

const TOOLTIP_GAP = 4;
const FLIP_THRESHOLD = 80;

interface CellCommentIndicatorProps {
  comment: CellComment;
}

export const CellCommentIndicator = memo(function CellCommentIndicator({
  comment,
}: CellCommentIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeout.current = setTimeout(() => setShowTooltip(false), 150);
  }, []);

  useLayoutEffect(() => {
    if (!showTooltip || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipHeight = tooltipEl?.offsetHeight ?? 60;

    const above = rect.top - tooltipHeight - TOOLTIP_GAP;
    const fitsAbove = above > FLIP_THRESHOLD;

    setPos({
      top: fitsAbove ? rect.top - tooltipHeight - TOOLTIP_GAP : rect.bottom + TOOLTIP_GAP,
      left: rect.right,
    });
  }, [showTooltip]);

  return (
    <>
      <div
        ref={triggerRef}
        className="absolute top-0 right-0 z-10 cursor-default"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: 0,
          height: 0,
          borderLeft: "8px solid transparent",
          borderTop: "8px solid hsl(var(--heroui-primary))",
        }}
      />
      {showTooltip &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-100 pointer-events-auto"
            style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="max-w-[240px] min-w-[120px] px-3 py-2 text-xs text-foreground bg-content1 border border-default-200 rounded-lg shadow-lg">
              <div className="font-medium text-default-700 mb-1">{comment.authorName}</div>
              <div className="whitespace-pre-wrap wrap-break-word">
                {comment.text || <span className="text-default-400 italic">Empty comment</span>}
              </div>
              <div className="text-[10px] text-default-400 mt-1">
                {new Date(comment.updatedAt).toLocaleString()}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
});
