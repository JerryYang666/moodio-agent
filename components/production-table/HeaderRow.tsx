"use client";

import React, { memo, useState, useRef, useCallback } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@heroui/button";
import type { ProductionTableColumn } from "@/lib/production-table/types";

interface HeaderRowProps {
  columns: ProductionTableColumn[];
  canEdit: boolean;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onColumnDragStart: (e: React.DragEvent, columnId: string) => void;
  onColumnDragOver: (e: React.DragEvent) => void;
  onColumnDrop: (e: React.DragEvent, targetColumnId: string) => void;
}

export const HeaderRow = memo(function HeaderRow({
  columns,
  canEdit,
  onRenameColumn,
  onDeleteColumn,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
}: HeaderRowProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback(
    (col: ProductionTableColumn) => {
      if (!canEdit) return;
      setEditingId(col.id);
      setEditValue(col.name);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [canEdit]
  );

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRenameColumn(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, onRenameColumn]);

  return (
    <div className="flex sticky top-0 z-10 bg-default-100 border-b-2 border-default-300">
      {/* Row number header */}
      <div className="w-12 shrink-0 border-r border-default-200 flex items-center justify-center text-xs font-semibold text-default-500">
        #
      </div>
      {columns.map((col) => (
        <div
          key={col.id}
          className="w-48 shrink-0 border-r border-default-200 flex items-center px-2 py-1.5 group"
          draggable={canEdit}
          onDragStart={(e) => canEdit && onColumnDragStart(e, col.id)}
          onDragOver={(e) => canEdit && onColumnDragOver(e)}
          onDrop={(e) => canEdit && onColumnDrop(e, col.id)}
        >
          {canEdit && (
            <GripVertical
              size={12}
              className="mr-1 text-default-300 cursor-grab active:cursor-grabbing shrink-0"
            />
          )}
          {editingId === col.id ? (
            <input
              ref={inputRef}
              className="flex-1 text-sm font-semibold bg-transparent border-b border-primary outline-none"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          ) : (
            <span
              className={`flex-1 text-sm font-semibold truncate ${
                canEdit ? "cursor-text" : ""
              }`}
              onDoubleClick={() => startRename(col)}
            >
              {col.name}
            </span>
          )}
          <span className="text-[10px] text-default-400 ml-1 shrink-0">
            {col.cellType}
          </span>
          {canEdit && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Delete column"
              className="ml-1 opacity-0 group-hover:opacity-100 shrink-0"
              onPress={() => onDeleteColumn(col.id)}
            >
              <Trash2 size={12} className="text-danger" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
});
