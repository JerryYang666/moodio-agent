"use client";

import React, { memo } from "react";
import { GripVertical } from "lucide-react";

interface RowHandleProps {
  rowIndex: number;
  rowId: string;
  canReorder: boolean;
  onDragStart: (index: number, e: React.DragEvent) => void;
  onDragOver: (index: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export const RowHandle = memo(function RowHandle({
  rowIndex,
  rowId,
  canReorder,
  onDragStart,
  onDragOver,
  onDragEnd,
}: RowHandleProps) {
  return (
    <div
      className={`flex items-center justify-center w-12 h-full text-xs text-default-400 select-none border-r border-default-200 bg-default-50 ${
        canReorder ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      draggable={canReorder}
      onDragStart={(e) => canReorder && onDragStart(rowIndex, e)}
      onDragOver={(e) => canReorder && onDragOver(rowIndex, e)}
      onDragEnd={onDragEnd}
    >
      {canReorder && <GripVertical size={12} className="mr-0.5 text-default-300" />}
      {rowIndex + 1}
    </div>
  );
});
