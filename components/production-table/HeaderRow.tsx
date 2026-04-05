"use client";

import React, { memo, useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@heroui/button";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import type { ProductionTableColumn } from "@/lib/production-table/types";
import type { CellType } from "@/lib/production-table/types";

interface HeaderRowProps {
  columns: ProductionTableColumn[];
  canEdit: boolean;
  colDragIndex: number | null;
  colDropSlot: number | null;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onColDragStart: (index: number, e: React.DragEvent) => void;
  onColDragOver: (index: number, e: React.DragEvent) => void;
  onColDragEnd: () => void;
  onAddColumn?: (cellType: CellType) => void;
  renderColGap: (slotIndex: number) => React.ReactNode;
}

export const HeaderRow = memo(function HeaderRow({
  columns,
  canEdit,
  colDragIndex,
  colDropSlot,
  onRenameColumn,
  onDeleteColumn,
  onColDragStart,
  onColDragOver,
  onColDragEnd,
  onAddColumn,
  renderColGap,
}: HeaderRowProps) {
  const t = useTranslations("productionTable");
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
      {columns.map((col, i) => (
        <React.Fragment key={col.id}>
          {renderColGap(i)}
          <div
            className={`w-48 shrink-0 border-r border-default-200 flex items-center px-2 py-1.5 group transition-opacity duration-200 ${
              colDragIndex === i ? "opacity-30" : ""
            }`}
            draggable={canEdit}
            onDragStart={(e) => canEdit && onColDragStart(i, e)}
            onDragOver={(e) => canEdit && onColDragOver(i, e)}
            onDragEnd={onColDragEnd}
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
            {editingId !== col.id && (
              <span className="text-[10px] text-default-400 ml-1 shrink-0">
                {col.cellType === "media" ? t("mediaCell") : t("textCell")}
              </span>
            )}
            {canEdit && editingId !== col.id && (
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
          {i === columns.length - 1 && renderColGap(columns.length)}
        </React.Fragment>
      ))}
      {/* Inline add-column button */}
      {canEdit && onAddColumn && (
        <div className="shrink-0 flex items-center justify-center w-10 border-r border-default-200">
          <Dropdown>
            <DropdownTrigger>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-md text-default-400 hover:text-primary hover:bg-default-200 transition-colors"
                aria-label="Add column"
              >
                <Plus size={16} />
              </button>
            </DropdownTrigger>
            <DropdownMenu onAction={(key) => onAddColumn(key as CellType)}>
              <DropdownItem key="text">{t("textCell")}</DropdownItem>
              <DropdownItem key="media">{t("mediaCell")}</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      )}
    </div>
  );
});
