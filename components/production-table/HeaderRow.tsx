"use client";

import React, { memo, useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { GripVertical, Plus, Trash2 } from "lucide-react";
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
  editableColumnIds: Set<string>;
  colDragIndex: number | null;
  colDropSlot: number | null;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onResizeColumn: (columnId: string, width: number) => void;
  onColDragStart: (index: number, e: React.DragEvent) => void;
  onColDragOver: (index: number, e: React.DragEvent) => void;
  onColDragEnd: () => void;
  onAddColumn?: (cellType: CellType) => void;
  renderColGap: (slotIndex: number) => React.ReactNode;
}

export const HeaderRow = memo(function HeaderRow({
  columns,
  canEdit,
  editableColumnIds,
  colDragIndex,
  colDropSlot,
  onRenameColumn,
  onDeleteColumn,
  onResizeColumn,
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

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{
    columnId: string;
    x: number;
    y: number;
  } | null>(null);

  // Column resize drag state
  const resizeRef = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeDelta, setResizeDelta] = useState(0);

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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, columnId: string) => {
      if (!canEdit) return;
      e.preventDefault();
      setContextMenu({ columnId, x: e.clientX, y: e.clientY });
    },
    [canEdit]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, col: ProductionTableColumn) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      resizeRef.current = {
        columnId: col.id,
        startX: e.clientX,
        startWidth: col.width,
      };
      setResizingId(col.id);
      setResizeDelta(0);
    },
    []
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      setResizeDelta(delta);
    },
    []
  );

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return;
      const { columnId, startWidth, startX } = resizeRef.current;
      const delta = e.clientX - startX;
      const newWidth = Math.max(80, Math.min(800, startWidth + delta));
      resizeRef.current = null;
      setResizingId(null);
      setResizeDelta(0);
      onResizeColumn(columnId, newWidth);
    },
    [onResizeColumn]
  );

  return (
    <>
      <div className="flex sticky top-0 z-10 bg-default-100 border-b-2 border-default-300">
        {/* Row number header */}
        <div className="w-12 shrink-0 border-r border-default-200 flex items-center justify-center text-xs font-semibold text-default-500">
          #
        </div>
        {columns.map((col, i) => {
          const liveWidth =
            resizingId === col.id
              ? Math.max(80, Math.min(800, col.width + resizeDelta))
              : col.width;

          return (
            <React.Fragment key={col.id}>
              {renderColGap(i)}
              <div
                className={`shrink-0 border-r border-default-200 flex items-center px-2 py-1.5 group transition-opacity duration-200 relative ${
                  colDragIndex === i ? "opacity-30" : ""
                } ${!canEdit && editableColumnIds.has(col.id) ? "bg-primary-50" : ""}`}
                style={{ width: liveWidth }}
                draggable={canEdit && resizingId === null}
                onDragStart={(e) =>
                  canEdit && resizingId === null && onColDragStart(i, e)
                }
                onDragOver={(e) => canEdit && onColDragOver(i, e)}
                onDragEnd={onColDragEnd}
                onContextMenu={(e) => handleContextMenu(e, col.id)}
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
                    className="flex-1 text-sm font-semibold bg-transparent border-b border-primary outline-none min-w-0"
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
                {/* Resize handle */}
                {(canEdit || editableColumnIds.has(col.id)) && (
                  <div
                    className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/30 active:bg-primary/50 z-10"
                    onPointerDown={(e) => handleResizePointerDown(e, col)}
                    onPointerMove={handleResizePointerMove}
                    onPointerUp={handleResizePointerUp}
                  />
                )}
              </div>
              {i === columns.length - 1 && renderColGap(columns.length)}
            </React.Fragment>
          );
        })}
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

      {/* Column context menu (portal to body via fixed positioning) */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={closeContextMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeContextMenu();
            }}
          />
          <div
            className="fixed z-50 min-w-[160px] py-1 rounded-lg shadow-lg border border-default-200 bg-content1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-danger hover:bg-danger/10 transition-colors"
              onClick={() => {
                onDeleteColumn(contextMenu.columnId);
                closeContextMenu();
              }}
            >
              <Trash2 size={14} />
              {t("deleteColumn")}
            </button>
          </div>
        </>
      )}
    </>
  );
});
