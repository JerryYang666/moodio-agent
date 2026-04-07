"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MousePointer2, Plus, Trash2, SendHorizontal, ArrowUp, ArrowDown } from "lucide-react";
import type {
  ProductionTableColumn,
  ProductionTableRow,
  EnrichedCell,
  CellLock,
  EnrichedMediaAssetRef,
  RemoteCellCursor,
} from "@/lib/production-table/types";
import type { CellType } from "@/lib/production-table/types";
import { TextCell } from "./TextCell";
import { MediaCell } from "./MediaCell";
import { RowHandle } from "./RowHandle";
import { HeaderRow } from "./HeaderRow";
import { useGridSelection } from "@/hooks/use-grid-selection";
import type { SelectMode } from "@/hooks/use-grid-selection";
import { AI_IMAGE_DRAG_MIME, AI_VIDEO_DRAG_MIME, AI_VIDEO_SUGGEST_DRAG_MIME } from "@/components/chat/asset-dnd";

const DEFAULT_ROW_HEIGHT = 48;
const DEFAULT_COL_WIDTH = 192;
const CURSOR_THROTTLE_MS = 40;

type DropSide = "before" | "after";

function userIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

interface ProductionTableGridProps {
  columns: ProductionTableColumn[];
  rows: ProductionTableRow[];
  cellMap: Record<string, EnrichedCell>;
  cellLocks: Map<string, CellLock>;
  remoteCursors: RemoteCellCursor[];
  currentUserId: string | undefined;
  canEditCell: (rowId: string, columnId: string) => boolean;
  canEditStructure: boolean;
  editableColumnIds: Set<string>;
  editableRowIds: Set<string>;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  onCellCommit: (
    columnId: string,
    rowId: string,
    textContent?: string | null,
    mediaAssets?: EnrichedMediaAssetRef[] | null
  ) => void;
  onMediaAssetAdd: (columnId: string, rowId: string, asset: EnrichedMediaAssetRef) => void;
  onMediaAssetRemove: (columnId: string, rowId: string, assetId: string) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onBulkDeleteRows?: (rowIds: string[]) => void;
  onBulkDeleteColumns?: (columnIds: string[]) => void;
  onReorderColumns: (fromIndex: number, toIndex: number) => void;
  onReorderRows: (fromIndex: number, toIndex: number) => void;
  onBulkReorderRows?: (newRowIds: string[]) => void;
  onBulkReorderColumns?: (newColumnIds: string[]) => void;
  onResizeColumn: (columnId: string, width: number) => void;
  onResizeRow: (rowId: string, height: number) => void;
  onBulkResizeRows?: (rowIds: string[], height: number) => void;
  onBulkResizeColumns?: (columnIds: string[], width: number) => void;
  onAddColumn?: (cellType: CellType) => void;
  onAddRow?: () => void;
  onInsertRow?: (anchorRowId: string, position: "above" | "below") => void;
  onInsertColumn?: (anchorColumnId: string, position: "left" | "right", cellType: CellType) => void;
}

export function ProductionTableGrid({
  columns,
  rows,
  cellMap,
  cellLocks,
  remoteCursors,
  currentUserId,
  canEditCell: canEditCellFn,
  canEditStructure,
  editableColumnIds,
  editableRowIds,
  sendEvent,
  onCellCommit,
  onMediaAssetAdd,
  onMediaAssetRemove,
  onRenameColumn,
  onDeleteColumn,
  onDeleteRow,
  onBulkDeleteRows,
  onBulkDeleteColumns,
  onReorderColumns,
  onReorderRows,
  onBulkReorderRows,
  onBulkReorderColumns,
  onResizeColumn,
  onResizeRow,
  onBulkResizeRows,
  onBulkResizeColumns,
  onAddColumn,
  onAddRow,
  onInsertRow,
  onInsertColumn,
}: ProductionTableGridProps) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const [isCellPainting, setIsCellPainting] = useState(false);

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const columnIds = useMemo(() => columns.map((c) => c.id), [columns]);

  const {
    selectedRows,
    selectedColumns,
    selectedCells,
    selectRow,
    selectColumn,
    selectCell,
    isCellSelected,
    clearSelection,
    startPaint,
    startCellPaint,
    movePaint,
    moveCellPaint,
    endPaint,
    isPainting,
  } = useGridSelection({ rowIds, columnIds });

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
      const toSlot =
        colDropTarget.side === "before"
          ? colDropTarget.index
          : colDropTarget.index + 1;

      if (selectedColumns.size > 1 && onBulkReorderColumns) {
        const selectedIndices = columns
          .map((c, i) => (selectedColumns.has(c.id) ? i : -1))
          .filter((i) => i >= 0);
        const selectedCols = selectedIndices.map((i) => columns[i]);
        const remaining = columns.filter((c) => !selectedColumns.has(c.id));

        let insertAt = toSlot;
        let removedBefore = 0;
        for (const si of selectedIndices) {
          if (si < toSlot) removedBefore++;
        }
        insertAt -= removedBefore;
        insertAt = Math.max(0, Math.min(remaining.length, insertAt));

        const newOrder = [
          ...remaining.slice(0, insertAt),
          ...selectedCols,
          ...remaining.slice(insertAt),
        ];
        onBulkReorderColumns(newOrder.map((c) => c.id));
      } else {
        const adjusted = toSlot > colDragIndex ? toSlot - 1 : toSlot;
        if (adjusted !== colDragIndex) {
          onReorderColumns(colDragIndex, adjusted);
        }
      }
    }
    setColDragIndex(null);
    setColDropTarget(null);
  }, [colDragIndex, colDropTarget, selectedColumns, columns, onBulkReorderColumns, onReorderColumns]);

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
      const toSlot =
        rowDropTarget.side === "before"
          ? rowDropTarget.index
          : rowDropTarget.index + 1;

      if (selectedRows.size > 1 && onBulkReorderRows) {
        const selectedIndices = rows
          .map((r, i) => (selectedRows.has(r.id) ? i : -1))
          .filter((i) => i >= 0);
        const selectedRowItems = selectedIndices.map((i) => rows[i]);
        const remaining = rows.filter((r) => !selectedRows.has(r.id));

        let insertAt = toSlot;
        let removedBefore = 0;
        for (const si of selectedIndices) {
          if (si < toSlot) removedBefore++;
        }
        insertAt -= removedBefore;
        insertAt = Math.max(0, Math.min(remaining.length, insertAt));

        const newOrder = [
          ...remaining.slice(0, insertAt),
          ...selectedRowItems,
          ...remaining.slice(insertAt),
        ];
        onBulkReorderRows(newOrder.map((r) => r.id));
      } else {
        const adjusted = toSlot > rowDragIndex ? toSlot - 1 : toSlot;
        if (adjusted !== rowDragIndex) {
          onReorderRows(rowDragIndex, adjusted);
        }
      }
    }
    setRowDragIndex(null);
    setRowDropTarget(null);
  }, [rowDragIndex, rowDropTarget, selectedRows, rows, onBulkReorderRows, onReorderRows]);

  // ---- Virtualizer ----
  const isRowDragging = rowDragIndex !== null;

  // ---- Row context menu ----
  const t = useTranslations("productionTable");
  const [rowContextMenu, setRowContextMenu] = useState<{
    rowId: string;
    x: number;
    y: number;
  } | null>(null);

  const handleRowContextMenu = useCallback(
    (rowId: string, x: number, y: number) => {
      if (!canEditStructure) return;
      setRowContextMenu({ rowId, x, y });
    },
    [canEditStructure]
  );

  const closeRowContextMenu = useCallback(() => setRowContextMenu(null), []);

  // ---- Cursor broadcasting ----
  const lastCursorSend = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // ---- Auto-scroll during paint-select ----
  const EDGE_ZONE = 40;
  const MAX_SCROLL_SPEED = 18;
  const autoScrollRef = useRef<number | null>(null);
  const mouseClientPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  const tickAutoScroll = useCallback(() => {
    if (!scrollElement) return;
    const rect = scrollElement.getBoundingClientRect();
    const { x, y } = mouseClientPos.current;
    let dx = 0;
    let dy = 0;

    if (y < rect.top + EDGE_ZONE) {
      dy = -MAX_SCROLL_SPEED * Math.max(0, 1 - (y - rect.top) / EDGE_ZONE);
    } else if (y > rect.bottom - EDGE_ZONE) {
      dy = MAX_SCROLL_SPEED * Math.max(0, 1 - (rect.bottom - y) / EDGE_ZONE);
    }
    if (x < rect.left + EDGE_ZONE) {
      dx = -MAX_SCROLL_SPEED * Math.max(0, 1 - (x - rect.left) / EDGE_ZONE);
    } else if (x > rect.right - EDGE_ZONE) {
      dx = MAX_SCROLL_SPEED * Math.max(0, 1 - (rect.right - x) / EDGE_ZONE);
    }

    if (dx !== 0 || dy !== 0) {
      scrollElement.scrollBy(dx, dy);
      const el = document.elementFromPoint(x, y);
      const wrapper = el?.closest("[data-cell-wrapper]") as HTMLElement | null;
      if (wrapper) {
        const rid = wrapper.getAttribute("data-row-id");
        const cid = wrapper.getAttribute("data-col-id");
        if (rid && cid) {
          moveCellPaint(rid, cid);
        }
      }
    }
    autoScrollRef.current = requestAnimationFrame(tickAutoScroll);
  }, [scrollElement, moveCellPaint]);

  useEffect(() => {
    return () => stopAutoScroll();
  }, [stopAutoScroll]);

  // ---- Auto-scroll during external DnD (drag from chat) ----
  const dndScrollRef = useRef<number | null>(null);
  const dndMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const stopDndScroll = useCallback(() => {
    if (dndScrollRef.current !== null) {
      cancelAnimationFrame(dndScrollRef.current);
      dndScrollRef.current = null;
    }
  }, []);

  const tickDndScroll = useCallback(() => {
    if (!scrollElement) return;
    const rect = scrollElement.getBoundingClientRect();
    const { x, y } = dndMousePos.current;
    let dx = 0;
    let dy = 0;

    if (y < rect.top + EDGE_ZONE) {
      dy = -MAX_SCROLL_SPEED * Math.max(0, 1 - (y - rect.top) / EDGE_ZONE);
    } else if (y > rect.bottom - EDGE_ZONE) {
      dy = MAX_SCROLL_SPEED * Math.max(0, 1 - (rect.bottom - y) / EDGE_ZONE);
    }
    if (x < rect.left + EDGE_ZONE) {
      dx = -MAX_SCROLL_SPEED * Math.max(0, 1 - (x - rect.left) / EDGE_ZONE);
    } else if (x > rect.right - EDGE_ZONE) {
      dx = MAX_SCROLL_SPEED * Math.max(0, 1 - (rect.right - x) / EDGE_ZONE);
    }

    if (dx !== 0 || dy !== 0) {
      scrollElement.scrollBy(dx, dy);
    }
    dndScrollRef.current = requestAnimationFrame(tickDndScroll);
  }, [scrollElement]);

  const isAssetDrag = useCallback((types: DOMStringList | readonly string[]) => {
    const t = Array.from(types);
    return (
      t.includes(AI_IMAGE_DRAG_MIME) ||
      t.includes(AI_VIDEO_DRAG_MIME) ||
      t.includes(AI_VIDEO_SUGGEST_DRAG_MIME)
    );
  }, []);

  const handleGridDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isAssetDrag(e.dataTransfer.types)) return;
      e.preventDefault();
      dndMousePos.current = { x: e.clientX, y: e.clientY };
      if (dndScrollRef.current === null) {
        dndScrollRef.current = requestAnimationFrame(tickDndScroll);
      }
    },
    [isAssetDrag, tickDndScroll]
  );

  const handleGridDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      stopDndScroll();
    },
    [stopDndScroll]
  );

  const handleGridDrop = useCallback(() => {
    stopDndScroll();
  }, [stopDndScroll]);

  useEffect(() => {
    return () => stopDndScroll();
  }, [stopDndScroll]);

  const handleGridMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Track position for auto-scroll during paint-select
      mouseClientPos.current = { x: e.clientX, y: e.clientY };
      if (isPainting() && autoScrollRef.current === null) {
        autoScrollRef.current = requestAnimationFrame(tickAutoScroll);
      }

      if (!sendEvent || !contentRef.current) return;
      const now = Date.now();
      if (now - lastCursorSend.current < CURSOR_THROTTLE_MS) return;
      lastCursorSend.current = now;

      const rect = contentRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      sendEvent("pt_cursor_move", { x, y });
    },
    [sendEvent, isPainting, tickAutoScroll]
  );

  const handleGridMouseLeave = useCallback(() => {
    if (!sendEvent) return;
    sendEvent("pt_cursor_leave", {});
  }, [sendEvent]);

  // ---- Selection handlers ----
  const handleSelectRow = useCallback(
    (rowId: string, mode: SelectMode) => {
      selectRow(rowId, mode);
    },
    [selectRow]
  );

  const handleSelectColumn = useCallback(
    (colId: string, mode: SelectMode) => {
      selectColumn(colId, mode);
    },
    [selectColumn]
  );

  const handleRowPaintStart = useCallback(
    (index: number) => {
      startPaint("row", index);
    },
    [startPaint]
  );

  const handleRowPaintMove = useCallback(
    (index: number) => {
      if (isPainting()) movePaint(index);
    },
    [isPainting, movePaint]
  );

  const handleColPaintStart = useCallback(
    (index: number) => {
      startPaint("col", index);
    },
    [startPaint]
  );

  const handleColPaintMove = useCallback(
    (index: number) => {
      if (isPainting()) movePaint(index);
    },
    [isPainting, movePaint]
  );

  // ---- Keyboard handler ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedRows.size > 0 && canEditStructure) {
          e.preventDefault();
          const ids = Array.from(selectedRows);
          clearSelection();
          if (onBulkDeleteRows) {
            onBulkDeleteRows(ids);
          } else {
            ids.forEach((id) => onDeleteRow(id));
          }
          return;
        }
        if (selectedColumns.size > 0 && canEditStructure) {
          e.preventDefault();
          const ids = Array.from(selectedColumns);
          clearSelection();
          if (onBulkDeleteColumns) {
            onBulkDeleteColumns(ids);
          } else {
            ids.forEach((id) => onDeleteColumn(id));
          }
          return;
        }
      }
    },
    [selectedRows, selectedColumns, canEditStructure, clearSelection, onBulkDeleteRows, onBulkDeleteColumns, onDeleteRow, onDeleteColumn]
  );

  // ---- Bulk resize wrappers ----
  const handleResizeRow = useCallback(
    (rowId: string, height: number) => {
      if (selectedRows.size > 1 && selectedRows.has(rowId) && onBulkResizeRows) {
        onBulkResizeRows(Array.from(selectedRows), height);
      } else {
        onResizeRow(rowId, height);
      }
    },
    [selectedRows, onBulkResizeRows, onResizeRow]
  );

  const handleResizeColumn = useCallback(
    (columnId: string, width: number) => {
      if (selectedColumns.size > 1 && selectedColumns.has(columnId) && onBulkResizeColumns) {
        onBulkResizeColumns(Array.from(selectedColumns), width);
      } else {
        onResizeColumn(columnId, width);
      }
    },
    [selectedColumns, onBulkResizeColumns, onResizeColumn]
  );

  // ---- Virtualizer ----
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: (i) => rows[i]?.height ?? DEFAULT_ROW_HEIGHT,
    overscan: isRowDragging ? rows.length : 5,
    enabled: !!scrollElement,
    getItemKey: (i) => rows[i]?.id ?? i,
  });

  const rowHeightKey = rows.map((r) => r.height ?? DEFAULT_ROW_HEIGHT).join(",");
  React.useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeightKey, rowVirtualizer]);

  // ---- Cell renderer ----
  const renderCell = useCallback(
    (row: ProductionTableRow, col: ProductionTableColumn) => {
      const key = `${col.id}:${row.id}`;
      const cell = cellMap[key];
      const lock = cellLocks.get(key);
      const editable = canEditCellFn(row.id, col.id);
      const selected = isCellSelected(row.id, col.id);

      if (col.cellType === "media") {
        return (
          <MediaCell
            key={key}
            rowId={row.id}
            columnId={col.id}
            assets={(cell?.mediaAssets as EnrichedMediaAssetRef[]) ?? []}
            canEdit={editable}
            isSelected={selected}
            lock={lock}
            currentUserId={currentUserId}
            onAddAsset={(asset) => onMediaAssetAdd(col.id, row.id, asset)}
            onRemoveAsset={(assetId) => onMediaAssetRemove(col.id, row.id, assetId)}
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
          isSelected={selected}
          lock={lock}
          currentUserId={currentUserId}
          sendEvent={sendEvent}
          onCommit={(value) => onCellCommit(col.id, row.id, value, null)}
        />
      );
    },
    [cellMap, cellLocks, canEditCellFn, isCellSelected, currentUserId, sendEvent, onCellCommit, onMediaAssetAdd, onMediaAssetRemove]
  );

  const totalWidth = useMemo(
    () =>
      48 +
      columns.reduce((sum, c) => sum + (c.width || DEFAULT_COL_WIDTH), 0),
    [columns]
  );

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

  // Track when a paint-select just ended so the subsequent click event doesn't clear the selection
  const justPaintedRef = useRef(false);

  const handlePaintEnd = useCallback(() => {
    if (isPainting()) {
      justPaintedRef.current = true;
    }
    endPaint();
    setIsCellPainting(false);
    stopAutoScroll();
  }, [isPainting, endPaint, stopAutoScroll]);

  // Window-level listeners for paint-select outside the grid
  useEffect(() => {
    if (!isCellPainting) return;

    const onWindowMouseMove = (e: MouseEvent) => {
      mouseClientPos.current = { x: e.clientX, y: e.clientY };
      if (autoScrollRef.current === null) {
        autoScrollRef.current = requestAnimationFrame(tickAutoScroll);
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const wrapper = el?.closest("[data-cell-wrapper]") as HTMLElement | null;
      if (wrapper) {
        const rid = wrapper.getAttribute("data-row-id");
        const cid = wrapper.getAttribute("data-col-id");
        if (rid && cid) moveCellPaint(rid, cid);
      }
    };
    const onWindowMouseUp = () => {
      handlePaintEnd();
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [isCellPainting, tickAutoScroll, moveCellPaint, handlePaintEnd]);

  const handleGridClick = useCallback(
    (e: React.MouseEvent) => {
      if (justPaintedRef.current) {
        justPaintedRef.current = false;
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target.closest("[data-row-handle]") ||
        target.closest("[data-col-header]") ||
        target.closest("[data-cell-wrapper]")
      ) {
        return;
      }
      if (selectedRows.size > 0 || selectedColumns.size > 0 || selectedCells.size > 0) {
        clearSelection();
      }
    },
    [selectedRows, selectedColumns, selectedCells, clearSelection]
  );

  // ---- Cell click/paint handlers ----
  const handleCellMouseDown = useCallback(
    (rowId: string, columnId: string, e: React.MouseEvent) => {
      if (e.detail >= 2 || e.button !== 0) return;
      const mode: SelectMode = e.metaKey || e.ctrlKey ? "toggle" : e.shiftKey ? "range" : "replace";
      if (mode === "replace") {
        startCellPaint(rowId, columnId);
        setIsCellPainting(true);
      } else {
        selectCell(rowId, columnId, mode);
      }
    },
    [selectCell, startCellPaint]
  );

  const handleCellMouseEnter = useCallback(
    (rowId: string, columnId: string) => {
      moveCellPaint(rowId, columnId);
    },
    [moveCellPaint]
  );

  // ---- Send selected cells to chat ----
  const handleSendToChat = useCallback(() => {
    if (selectedCells.size === 0) return;

    const colNameMap = new Map(columns.map((c) => [c.id, c.name]));
    const rowIndexMap = new Map(rows.map((r, i) => [r.id, i + 1]));

    const images: Array<{ assetId: string; imageId: string; url: string; title?: string }> = [];
    const textParts: string[] = [];

    for (const key of Array.from(selectedCells)) {
      const cell = cellMap[key];
      if (!cell) continue;

      const [colId, rowId] = key.split(":");
      const colName = colNameMap.get(colId) ?? colId;
      const rowNum = rowIndexMap.get(rowId) ?? "?";
      const label = `[Row ${rowNum} / ${colName}]`;

      if (cell.textContent) {
        textParts.push(`${label} ${cell.textContent}`);
      }
      const assets = cell.mediaAssets as EnrichedMediaAssetRef[] | null;
      if (assets && assets.length > 0) {
        for (const a of assets) {
          if (a.imageUrl && a.imageId) {
            images.push({
              assetId: a.assetId,
              imageId: a.imageId,
              url: a.imageUrl,
              title: `Row ${rowNum} / ${colName}`,
            });
          }
        }
      }
    }

    const text = textParts.filter(Boolean).join("\n");
    window.dispatchEvent(
      new CustomEvent("moodio-batch-to-chat", {
        detail: {
          images: images.length > 0 ? images : undefined,
          text: text || undefined,
        },
      })
    );
    clearSelection();
  }, [selectedCells, cellMap, columns, rows, clearSelection]);

  return (
  <>
    {/* tabIndex allows keyboard events */}
    <div
      ref={setScrollElement}
      className="flex-1 overflow-auto outline-none"
      onMouseLeave={handleGridMouseLeave}
      onMouseMove={handleGridMouseMove}
      onMouseUp={handlePaintEnd}
      onKeyDown={handleKeyDown}
      onClick={handleGridClick}
      onDragOver={handleGridDragOver}
      onDragLeave={handleGridDragLeave}
      onDrop={handleGridDrop}
      tabIndex={0}
    >
      <div ref={contentRef} style={{ minWidth: totalWidth, position: "relative" }}>
        <HeaderRow
          columns={columns}
          canEdit={canEditStructure}
          editableColumnIds={editableColumnIds}
          colDragIndex={colDragIndex}
          colDropSlot={colDropSlot}
          selectedColumns={selectedColumns}
          onSelectColumn={handleSelectColumn}
          onColPaintStart={handleColPaintStart}
          onColPaintMove={handleColPaintMove}
          onColPaintEnd={handlePaintEnd}
          onRenameColumn={onRenameColumn}
          onDeleteColumn={onDeleteColumn}
          onResizeColumn={handleResizeColumn}
          onColDragStart={handleColDragStart}
          onColDragOver={handleColDragOver}
          onColDragEnd={handleColDragEnd}
          onAddColumn={onAddColumn}
          onInsertColumn={onInsertColumn}
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
            const isDraggedRow = selectedRows.size > 1
              ? selectedRows.has(row.id) && rowDragIndex !== null
              : rowDragIndex === idx;
            const rowHeight = row.height ?? DEFAULT_ROW_HEIGHT;

            return (
              <React.Fragment key={row.id}>
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
                    height={rowHeight}
                    canReorder={canEditStructure}
                    isEditable={editableRowIds.has(row.id)}
                    isSelected={selectedRows.has(row.id)}
                    onSelect={handleSelectRow}
                    onPaintStart={handleRowPaintStart}
                    onPaintMove={handleRowPaintMove}
                    onPaintEnd={handlePaintEnd}
                    onDragStart={handleRowDragStart}
                    onDragOver={handleRowDragOver}
                    onDragEnd={handleRowDragEnd}
                    onResizeRow={handleResizeRow}
                    onRowContextMenu={handleRowContextMenu}
                  />
                  {columns.map((col, colIdx) => (
                    <React.Fragment key={col.id}>
                      {renderColGap(colIdx)}
                      <div
                        data-cell-wrapper
                        data-row-id={row.id}
                        data-col-id={col.id}
                        className={`shrink-0 border-r border-default-200 relative select-none ${
                          colDragIndex === colIdx ? "opacity-30" : ""
                        } ${isCellSelected(row.id, col.id) ? "ring-2 ring-inset ring-primary" : ""}`}
                        style={{ width: col.width || DEFAULT_COL_WIDTH }}
                        onMouseDown={(e) => handleCellMouseDown(row.id, col.id, e)}
                        onMouseEnter={() => handleCellMouseEnter(row.id, col.id)}
                      >
                        {renderCell(row, col)}
                      </div>
                      {colIdx === columns.length - 1 &&
                        renderColGap(columns.length)}
                    </React.Fragment>
                  ))}
                </div>
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

        {/* Remote cursors */}
        {remoteCursors.map((cursor) => {
          const color = userIdToColor(cursor.userId);
          return (
            <div
              key={cursor.sessionId}
              className="absolute pointer-events-none z-50 transition-all duration-75"
              style={{ left: cursor.x, top: cursor.y, transform: "translate(-1px, -1px)" }}
            >
              <MousePointer2 size={18} fill={color} color={color} strokeWidth={1.5} />
              <span
                className="absolute left-4 top-3 px-1.5 py-0.5 text-[10px] text-white rounded whitespace-nowrap"
                style={{ backgroundColor: color }}
              >
                {cursor.userName || "?"}
              </span>
            </div>
          );
        })}
      </div>
    </div>

    {/* Row context menu */}
    {rowContextMenu && (
      <>
        <div
          className="fixed inset-0 z-50"
          onClick={closeRowContextMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeRowContextMenu();
          }}
        />
        <div
          className="fixed z-50 min-w-[160px] py-1 rounded-lg shadow-lg border border-default-200 bg-content1"
          style={{ left: rowContextMenu.x, top: rowContextMenu.y }}
        >
          {onInsertRow && (
            <>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-default-100 transition-colors"
                onClick={() => {
                  onInsertRow(rowContextMenu.rowId, "above");
                  closeRowContextMenu();
                }}
              >
                <ArrowUp size={14} />
                {t("insertRowAbove")}
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-default-100 transition-colors"
                onClick={() => {
                  onInsertRow(rowContextMenu.rowId, "below");
                  closeRowContextMenu();
                }}
              >
                <ArrowDown size={14} />
                {t("insertRowBelow")}
              </button>
              <div className="my-1 border-t border-default-200" />
            </>
          )}
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-danger hover:bg-danger/10 transition-colors"
            onClick={() => {
              const idsToDelete = selectedRows.has(rowContextMenu.rowId) && selectedRows.size > 1
                ? Array.from(selectedRows)
                : [rowContextMenu.rowId];
              clearSelection();
              if (idsToDelete.length > 1 && onBulkDeleteRows) {
                onBulkDeleteRows(idsToDelete);
              } else {
                idsToDelete.forEach((id) => onDeleteRow(id));
              }
              closeRowContextMenu();
            }}
          >
            <Trash2 size={14} />
            {selectedRows.has(rowContextMenu.rowId) && selectedRows.size > 1
              ? `${t("deleteRow")} (${selectedRows.size})`
              : t("deleteRow")}
          </button>
        </div>
      </>
    )}

    {/* Floating Send to Chat bar for cell selection */}
    {selectedCells.size > 0 && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full shadow-lg border border-default-200 bg-content1/95 backdrop-blur-sm">
        <span className="text-sm text-default-600">
          {selectedCells.size} {selectedCells.size === 1 ? t("cellSelected") : t("cellsSelected")}
        </span>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
          onClick={handleSendToChat}
        >
          <SendHorizontal size={14} />
          {t("sendToChat")}
        </button>
      </div>
    )}
  </>
  );
}
