"use client";

import React, { memo, useRef, useState, useCallback } from "react";
import { GripVertical } from "lucide-react";

interface RowHandleProps {
  rowIndex: number;
  rowId: string;
  height: number;
  canReorder: boolean;
  isEditable: boolean;
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

  const liveHeight = resizing
    ? Math.max(32, Math.min(400, height + resizeDelta))
    : height;

  return (
    <div
      className={`relative flex items-center justify-center w-12 text-xs text-default-400 select-none border-r border-default-200 ${
        !canReorder && isEditable ? "bg-primary-50" : "bg-default-50"
      } ${
        canReorder && !resizing ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      style={{ height: liveHeight }}
      draggable={canReorder && !resizing}
      onDragStart={(e) => canReorder && !resizing && onDragStart(rowIndex, e)}
      onDragOver={(e) => canReorder && onDragOver(rowIndex, e)}
      onDragEnd={onDragEnd}
      onContextMenu={handleContextMenu}
    >
      {canReorder && (
        <GripVertical size={12} className="mr-0.5 text-default-300" />
      )}
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
