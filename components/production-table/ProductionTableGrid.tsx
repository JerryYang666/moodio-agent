"use client";

import React, { useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ProductionTableColumn,
  ProductionTableRow,
  EnrichedCell,
  CellLock,
  MediaAssetRef,
} from "@/lib/production-table/types";
import { TextCell } from "./TextCell";
import { MediaCell } from "./MediaCell";
import { RowHandle } from "./RowHandle";
import { HeaderRow } from "./HeaderRow";

const ROW_HEIGHT = 48;

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
    mediaAssets?: MediaAssetRef[] | null
  ) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onColumnDragStart: (e: React.DragEvent, columnId: string) => void;
  onColumnDragOver: (e: React.DragEvent) => void;
  onColumnDrop: (e: React.DragEvent, targetColumnId: string) => void;
  onRowDragStart: (e: React.DragEvent, rowId: string) => void;
  onRowDragOver: (e: React.DragEvent) => void;
  onRowDrop: (e: React.DragEvent, targetRowId: string) => void;
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
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
}: ProductionTableGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

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
            assets={(cell?.mediaAssets as MediaAssetRef[]) ?? []}
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

  const totalWidth = useMemo(
    () => 48 + columns.length * 192,
    [columns.length]
  );

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div style={{ minWidth: totalWidth }}>
        <HeaderRow
          columns={columns}
          canEdit={canEditStructure}
          onRenameColumn={onRenameColumn}
          onDeleteColumn={onDeleteColumn}
          onColumnDragStart={onColumnDragStart}
          onColumnDragOver={onColumnDragOver}
          onColumnDrop={onColumnDrop}
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
            return (
              <div
                key={row.id}
                className="flex border-b border-default-200"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <RowHandle
                  rowIndex={virtualRow.index}
                  rowId={row.id}
                  canReorder={canEditStructure}
                  onDragStart={onRowDragStart}
                  onDragOver={onRowDragOver}
                  onDrop={onRowDrop}
                />
                {columns.map((col) => (
                  <div
                    key={col.id}
                    className="w-48 shrink-0 border-r border-default-200"
                  >
                    {renderCell(row, col)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
