"use client";

import React, { memo, useRef, useState, useCallback } from "react";
import type { SelectMode } from "@/hooks/use-grid-selection";
import { selectModeFromEvent } from "@/hooks/use-grid-selection";

interface RowHandleProps {
  rowIndex: number;
  rowId: string;
  height: number;
  canReorder: boolean;
  isEditable: boolean;
  isSelected: boolean;
  onSelect: (rowId: string, mode: SelectMode) => void;
  onPaintStart: (index: number) => void;
  onPaintMove: (index: number) => void;
  onPaintEnd: () => void;
  onDragStart: (index: number, e: React.DragEvent) => void;
  onDragOver: (index: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onResizeRow: (rowId: string, height: number) => void;
  onRowContextMenu: (rowId: string, x: number, y: number) => void;
}

export const RowHandle = memo(function RowHandle({
  rowIndex,
  rowId,
  height,
  canReorder,
  isEditable,
  isSelected,
  onSelect,
  onPaintStart,
  onPaintMove,
  onPaintEnd,
  onDragStart,
  onDragOver,
  onDragEnd,
  onResizeRow,
  onRowContextMenu,
}: RowHandleProps) {
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(
    null
  );
  const [resizing, setResizing] = useState(false);
  const [resizeDelta, setResizeDelta] = useState(0);
  const didPaintRef = useRef(false);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!canReorder) return;
      e.preventDefault();
      onRowContextMenu(rowId, e.clientX, e.clientY);
    },
    [canReorder, rowId, onRowContextMenu]
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      resizeRef.current = { startY: e.clientY, startHeight: height };
      setResizing(true);
      setResizeDelta(0);
    },
    [height]
  );

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    setResizeDelta(e.clientY - resizeRef.current.startY);
  }, []);

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientY - resizeRef.current.startY;
      const newHeight = Math.max(
        32,
        Math.min(400, resizeRef.current.startHeight + delta)
      );
      resizeRef.current = null;
      setResizing(false);
      setResizeDelta(0);
      onResizeRow(rowId, newHeight);
    },
    [rowId, onResizeRow]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!canReorder || resizing) return;
      if (e.button !== 0) return;

      if (isSelected) return;

      didPaintRef.current = false;
      onPaintStart(rowIndex);

      const handleMove = () => {
        didPaintRef.current = true;
      };
      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        onPaintEnd();
        if (!didPaintRef.current) {
          onSelect(rowId, selectModeFromEvent(e));
        }
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [canReorder, resizing, isSelected, rowIndex, rowId, onPaintStart, onPaintEnd, onSelect]
  );

  const handleMouseEnter = useCallback(() => {
    onPaintMove(rowIndex);
  }, [onPaintMove, rowIndex]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!canReorder || resizing) return;
      if (isSelected && !didPaintRef.current) {
        onSelect(rowId, selectModeFromEvent(e));
      }
    },
    [canReorder, resizing, isSelected, rowId, onSelect]
  );

  const liveHeight = resizing
    ? Math.max(32, Math.min(400, height + resizeDelta))
    : height;

  const canDrag = canReorder && !resizing && isSelected;

  return (
    <div
      data-row-handle
      className={`sticky left-0 z-5 shrink-0 flex items-center justify-center w-8 text-xs text-default-400 select-none border-r border-default-200 ${
        isSelected
          ? "bg-primary-100 border-l-2 border-l-primary"
          : !canReorder && isEditable
            ? "bg-primary-50"
            : "bg-default-50"
      } ${
        canDrag ? "cursor-grab active:cursor-grabbing" : canReorder ? "cursor-pointer" : ""
      }`}
      style={{ height: liveHeight }}
      draggable={canDrag}
      onDragStart={(e) => canDrag && onDragStart(rowIndex, e)}
      onDragOver={(e) => canReorder && onDragOver(rowIndex, e)}
      onDragEnd={onDragEnd}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
    >
      {rowIndex + 1}
      {(canReorder || isEditable) && (
        <div
          className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-primary/30 active:bg-primary/50 z-10"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
        />
      )}
    </div>
  );
});
