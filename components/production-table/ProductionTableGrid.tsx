"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus } from "lucide-react";
import type {
  ProductionTableColumn,
  ProductionTableRow,
  EnrichedCell,
  CellLock,
  EnrichedMediaAssetRef,
} from "@/lib/production-table/types";
import type { CellType } from "@/lib/production-table/types";
import { TextCell } from "./TextCell";
import { MediaCell } from "./MediaCell";
import { RowHandle } from "./RowHandle";
import { HeaderRow } from "./HeaderRow";

const ROW_HEIGHT = 48;

type DropSide = "before" | "after";

interface ProductionTableGridProps {
  columns: ProductionTableColumn[];
  rows: ProductionTableRow[];
  cellMap: Record<string, EnrichedCell>;
  cellLocks: Map<string, CellLock>;
  currentUserId: string | undefined;
  canEditCell: (rowId: string, columnId: string) => boolean;
  canEditStructure: boolean;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  onCellCommit: (
    columnId: string,
    rowId: string,
    textContent?: string | null,
    mediaAssets?: EnrichedMediaAssetRef[] | null
  ) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onReorderColumns: (fromIndex: number, toIndex: number) => void;
  onReorderRows: (fromIndex: number, toIndex: number) => void;
  onAddColumn?: (cellType: CellType) => void;
  onAddRow?: () => void;
}

export function ProductionTableGrid({
  columns,
  rows,
  cellMap,
  cellLocks,
  currentUserId,
  canEditCell: canEditCellFn,
  canEditStructure,
  sendEvent,
  onCellCommit,
  onRenameColumn,
  onDeleteColumn,
  onDeleteRow,
  onReorderColumns,
  onReorderRows,
  onAddColumn,
  onAddRow,
}: ProductionTableGridProps) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  // ---- Column drag state ----
  const [colDragIndex, setColDragIndex] = useState<number | null>(null);
  const [colDropTarget, setColDropTarget] = useState<{
    index: number;
    side: DropSide;
  } | null>(null);

  const colDropSlot = useMemo(() => {
    if (colDragIndex === null || !colDropTarget) return null;
    const slot =
      colDropTarget.side === "before"
        ? colDropTarget.index
        : colDropTarget.index + 1;
    if (slot === colDragIndex || slot === colDragIndex + 1) return null;
    return slot;
  }, [colDragIndex, colDropTarget]);

  const handleColDragStart = useCallback((index: number, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    setColDragIndex(index);
  }, []);

  const handleColDragOver = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (colDragIndex === null) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const side: DropSide = e.clientX < midX ? "before" : "after";
      const insertionIndex = side === "before" ? index : index + 1;
      if (
        insertionIndex === colDragIndex ||
        insertionIndex === colDragIndex + 1
      ) {
        setColDropTarget(null);
        return;
      }
      setColDropTarget({ index, side });
    },
    [colDragIndex]
  );

  const handleColDragEnd = useCallback(() => {
    if (colDragIndex !== null && colDropTarget !== null) {
      const toIndex =
        colDropTarget.side === "before"
          ? colDropTarget.index
          : colDropTarget.index + 1;
      const adjusted = toIndex > colDragIndex ? toIndex - 1 : toIndex;
      if (adjusted !== colDragIndex) {
        onReorderColumns(colDragIndex, adjusted);
      }
    }
    setColDragIndex(null);
    setColDropTarget(null);
  }, [colDragIndex, colDropTarget, onReorderColumns]);

  // ---- Row drag state ----
  const [rowDragIndex, setRowDragIndex] = useState<number | null>(null);
  const [rowDropTarget, setRowDropTarget] = useState<{
    index: number;
    side: DropSide;
  } | null>(null);

  const rowDropSlot = useMemo(() => {
    if (rowDragIndex === null || !rowDropTarget) return null;
    const slot =
      rowDropTarget.side === "before"
        ? rowDropTarget.index
        : rowDropTarget.index + 1;
    if (slot === rowDragIndex || slot === rowDragIndex + 1) return null;
    return slot;
  }, [rowDragIndex, rowDropTarget]);

  const handleRowDragStart = useCallback(
    (index: number, e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      setRowDragIndex(index);
    },
    []
  );

  const handleRowDragOver = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (rowDragIndex === null) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const side: DropSide = e.clientY < midY ? "before" : "after";
      const insertionIndex = side === "before" ? index : index + 1;
      if (
        insertionIndex === rowDragIndex ||
        insertionIndex === rowDragIndex + 1
      ) {
        setRowDropTarget(null);
        return;
      }
      setRowDropTarget({ index, side });
    },
    [rowDragIndex]
  );

  const handleRowDragEnd = useCallback(() => {
    if (rowDragIndex !== null && rowDropTarget !== null) {
      const toIndex =
        rowDropTarget.side === "before"
          ? rowDropTarget.index
          : rowDropTarget.index + 1;
      const adjusted = toIndex > rowDragIndex ? toIndex - 1 : toIndex;
      if (adjusted !== rowDragIndex) {
        onReorderRows(rowDragIndex, adjusted);
      }
    }
    setRowDragIndex(null);
    setRowDropTarget(null);
  }, [rowDragIndex, rowDropTarget, onReorderRows]);

  // ---- Virtualizer (disabled during row drag for stable layout) ----
  const isRowDragging = rowDragIndex !== null;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: isRowDragging ? rows.length : 5,
    enabled: !!scrollElement,
  });

  // ---- Cell renderer ----
  const renderCell = useCallback(
    (row: ProductionTableRow, col: ProductionTableColumn) => {
      const key = `${col.id}:${row.id}`;
      const cell = cellMap[key];
      const lock = cellLocks.get(key);
      const editable = canEditCellFn(row.id, col.id);

      if (col.cellType === "media") {
        return (
          <MediaCell
            key={key}
            rowId={row.id}
            columnId={col.id}
            assets={(cell?.mediaAssets as EnrichedMediaAssetRef[]) ?? []}
            canEdit={editable}
            lock={lock}
            currentUserId={currentUserId}
            onCommit={(assets) =>
              onCellCommit(col.id, row.id, null, assets)
            }
          />
        );
      }

      return (
        <TextCell
          key={key}
          rowId={row.id}
          columnId={col.id}
          value={cell?.textContent ?? ""}
          canEdit={editable}
          lock={lock}
          currentUserId={currentUserId}
          sendEvent={sendEvent}
          onCommit={(value) => onCellCommit(col.id, row.id, value, null)}
        />
      );
    },
    [cellMap, cellLocks, canEditCellFn, currentUserId, sendEvent, onCellCommit]
  );

  const COL_WIDTH = 192;
  const totalWidth = useMemo(
    () => 48 + columns.length * COL_WIDTH,
    [columns.length]
  );

  // Shared column gap renderer used in both header and body rows
  const renderColGap = useCallback(
    (slotIndex: number) => (
      <div
        className={`shrink-0 transition-all duration-200 ease-out flex items-center justify-center ${
          colDropSlot === slotIndex ? "w-3 mx-0.5" : "w-0"
        }`}
      >
        {colDropSlot === slotIndex && (
          <div className="w-[3px] h-[32px] bg-primary rounded-full shadow-[0_0_6px_1px_hsl(var(--heroui-primary)/0.5)]" />
        )}
      </div>
    ),
    [colDropSlot]
  );

  return (
    <div ref={setScrollElement} className="flex-1 overflow-auto">
      <div style={{ minWidth: totalWidth }}>
        <HeaderRow
          columns={columns}
          canEdit={canEditStructure}
          colDragIndex={colDragIndex}
          colDropSlot={colDropSlot}
          onRenameColumn={onRenameColumn}
          onDeleteColumn={onDeleteColumn}
          onColDragStart={handleColDragStart}
          onColDragOver={handleColDragOver}
          onColDragEnd={handleColDragEnd}
          onAddColumn={onAddColumn}
          renderColGap={renderColGap}
        />
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const idx = virtualRow.index;
            const isDraggedRow = rowDragIndex === idx;

            return (
              <React.Fragment key={row.id}>
                {/* Row drop indicator BEFORE this row */}
                {rowDropSlot === idx && (
                  <div
                    className="absolute left-0 w-full flex items-center justify-center transition-all duration-200 ease-out"
                    style={{
                      top: virtualRow.start - 3,
                      height: 6,
                      zIndex: 20,
                    }}
                  >
                    <div className="w-full h-[3px] bg-primary rounded-full shadow-[0_0_6px_1px_hsl(var(--heroui-primary)/0.5)]" />
                  </div>
                )}
                <div
                  className={`flex border-b border-default-200 transition-opacity duration-200 ${
                    isDraggedRow ? "opacity-30" : ""
                  }`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onDragOver={(e) => canEditStructure && handleRowDragOver(idx, e)}
                  onDragEnd={handleRowDragEnd}
                >
                  <RowHandle
                    rowIndex={idx}
                    rowId={row.id}
                    canReorder={canEditStructure}
                    onDragStart={handleRowDragStart}
                    onDragOver={handleRowDragOver}
                    onDragEnd={handleRowDragEnd}
                  />
                  {columns.map((col, colIdx) => (
                    <React.Fragment key={col.id}>
                      {renderColGap(colIdx)}
                      <div
                        className={`w-48 shrink-0 border-r border-default-200 ${
                          colDragIndex === colIdx ? "opacity-30" : ""
                        }`}
                      >
                        {renderCell(row, col)}
                      </div>
                      {colIdx === columns.length - 1 &&
                        renderColGap(columns.length)}
                    </React.Fragment>
                  ))}
                </div>
                {/* Row drop indicator AFTER last row */}
                {idx === rows.length - 1 && rowDropSlot === rows.length && (
                  <div
                    className="absolute left-0 w-full flex items-center justify-center transition-all duration-200 ease-out"
                    style={{
                      top: virtualRow.start + virtualRow.size - 3,
                      height: 6,
                      zIndex: 20,
                    }}
                  >
                    <div className="w-full h-[3px] bg-primary rounded-full shadow-[0_0_6px_1px_hsl(var(--heroui-primary)/0.5)]" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
        {/* Inline add-row button below the last row */}
        {canEditStructure && onAddRow && (
          <div className="flex border-b border-dashed border-default-200">
            <div className="w-12 shrink-0" />
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-default-400 hover:text-primary hover:bg-default-100 transition-colors rounded-md my-0.5"
              onClick={onAddRow}
              aria-label="Add row"
            >
              <Plus size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
