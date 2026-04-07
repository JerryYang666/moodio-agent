"use client";

import { useState, useCallback, useRef } from "react";

export type SelectMode = "replace" | "toggle" | "range";

export interface CellCoord {
  rowId: string;
  columnId: string;
}

function cellKey(rowId: string, columnId: string): string {
  return `${columnId}:${rowId}`;
}

export function selectModeFromEvent(e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): SelectMode {
  if (e.shiftKey) return "range";
  if (e.metaKey || e.ctrlKey) return "toggle";
  return "replace";
}

interface UseGridSelectionOptions {
  rowIds: string[];
  columnIds: string[];
}

export function useGridSelection({ rowIds, columnIds }: UseGridSelectionOptions) {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set());
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(() => new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(() => new Set());
  const lastSelectedRowRef = useRef<string | null>(null);
  const lastSelectedColRef = useRef<string | null>(null);
  const lastSelectedCellRef = useRef<CellCoord | null>(null);

  // Paint-select tracking
  const paintAxisRef = useRef<"row" | "col" | "cell" | null>(null);
  const paintAnchorRef = useRef<number>(-1);
  const paintCellAnchorRef = useRef<CellCoord | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
    setSelectedColumns(new Set());
    setSelectedCells(new Set());
    lastSelectedRowRef.current = null;
    lastSelectedColRef.current = null;
    lastSelectedCellRef.current = null;
    paintAxisRef.current = null;
  }, []);

  const selectRow = useCallback(
    (id: string, mode: SelectMode) => {
      setSelectedColumns(new Set());
      setSelectedCells(new Set());
      lastSelectedColRef.current = null;
      lastSelectedCellRef.current = null;

      setSelectedRows((prev) => {
        if (mode === "replace") {
          lastSelectedRowRef.current = id;
          return new Set([id]);
        }
        if (mode === "toggle") {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          lastSelectedRowRef.current = id;
          return next;
        }
        // range
        const anchor = lastSelectedRowRef.current;
        const anchorIdx = anchor ? rowIds.indexOf(anchor) : -1;
        const targetIdx = rowIds.indexOf(id);
        if (anchorIdx === -1 || targetIdx === -1) {
          lastSelectedRowRef.current = id;
          return new Set([id]);
        }
        const from = Math.min(anchorIdx, targetIdx);
        const to = Math.max(anchorIdx, targetIdx);
        const next = new Set<string>();
        for (let i = from; i <= to; i++) {
          next.add(rowIds[i]);
        }
        return next;
      });
    },
    [rowIds]
  );

  const selectColumn = useCallback(
    (id: string, mode: SelectMode) => {
      setSelectedRows(new Set());
      setSelectedCells(new Set());
      lastSelectedRowRef.current = null;
      lastSelectedCellRef.current = null;

      setSelectedColumns((prev) => {
        if (mode === "replace") {
          lastSelectedColRef.current = id;
          return new Set([id]);
        }
        if (mode === "toggle") {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          lastSelectedColRef.current = id;
          return next;
        }
        // range
        const anchor = lastSelectedColRef.current;
        const anchorIdx = anchor ? columnIds.indexOf(anchor) : -1;
        const targetIdx = columnIds.indexOf(id);
        if (anchorIdx === -1 || targetIdx === -1) {
          lastSelectedColRef.current = id;
          return new Set([id]);
        }
        const from = Math.min(anchorIdx, targetIdx);
        const to = Math.max(anchorIdx, targetIdx);
        const next = new Set<string>();
        for (let i = from; i <= to; i++) {
          next.add(columnIds[i]);
        }
        return next;
      });
    },
    [columnIds]
  );

  const paintSelectRows = useCallback(
    (anchorIndex: number, currentIndex: number) => {
      setSelectedColumns(new Set());
      setSelectedCells(new Set());
      const from = Math.min(anchorIndex, currentIndex);
      const to = Math.max(anchorIndex, currentIndex);
      const next = new Set<string>();
      for (let i = from; i <= to; i++) {
        if (rowIds[i]) next.add(rowIds[i]);
      }
      setSelectedRows(next);
      if (rowIds[anchorIndex]) lastSelectedRowRef.current = rowIds[anchorIndex];
    },
    [rowIds]
  );

  const paintSelectColumns = useCallback(
    (anchorIndex: number, currentIndex: number) => {
      setSelectedRows(new Set());
      setSelectedCells(new Set());
      const from = Math.min(anchorIndex, currentIndex);
      const to = Math.max(anchorIndex, currentIndex);
      const next = new Set<string>();
      for (let i = from; i <= to; i++) {
        if (columnIds[i]) next.add(columnIds[i]);
      }
      setSelectedColumns(next);
      if (columnIds[anchorIndex]) lastSelectedColRef.current = columnIds[anchorIndex];
    },
    [columnIds]
  );

  const selectCell = useCallback(
    (rowId: string, columnId: string, mode: SelectMode) => {
      setSelectedRows(new Set());
      setSelectedColumns(new Set());
      lastSelectedRowRef.current = null;
      lastSelectedColRef.current = null;

      const key = cellKey(rowId, columnId);

      setSelectedCells((prev) => {
        if (mode === "replace") {
          lastSelectedCellRef.current = { rowId, columnId };
          return new Set([key]);
        }
        if (mode === "toggle") {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          lastSelectedCellRef.current = { rowId, columnId };
          return next;
        }
        // range: rectangular selection from anchor to target
        const anchor = lastSelectedCellRef.current;
        if (!anchor) {
          lastSelectedCellRef.current = { rowId, columnId };
          return new Set([key]);
        }
        const r1 = rowIds.indexOf(anchor.rowId);
        const r2 = rowIds.indexOf(rowId);
        const c1 = columnIds.indexOf(anchor.columnId);
        const c2 = columnIds.indexOf(columnId);
        if (r1 === -1 || r2 === -1 || c1 === -1 || c2 === -1) {
          lastSelectedCellRef.current = { rowId, columnId };
          return new Set([key]);
        }
        const fromR = Math.min(r1, r2);
        const toR = Math.max(r1, r2);
        const fromC = Math.min(c1, c2);
        const toC = Math.max(c1, c2);
        const next = new Set<string>();
        for (let ri = fromR; ri <= toR; ri++) {
          for (let ci = fromC; ci <= toC; ci++) {
            next.add(cellKey(rowIds[ri], columnIds[ci]));
          }
        }
        return next;
      });
    },
    [rowIds, columnIds]
  );

  const paintSelectCells = useCallback(
    (anchorRowId: string, anchorColId: string, currentRowId: string, currentColId: string) => {
      setSelectedRows(new Set());
      setSelectedColumns(new Set());
      const r1 = rowIds.indexOf(anchorRowId);
      const r2 = rowIds.indexOf(currentRowId);
      const c1 = columnIds.indexOf(anchorColId);
      const c2 = columnIds.indexOf(currentColId);
      if (r1 === -1 || r2 === -1 || c1 === -1 || c2 === -1) return;
      const fromR = Math.min(r1, r2);
      const toR = Math.max(r1, r2);
      const fromC = Math.min(c1, c2);
      const toC = Math.max(c1, c2);
      const next = new Set<string>();
      for (let ri = fromR; ri <= toR; ri++) {
        for (let ci = fromC; ci <= toC; ci++) {
          next.add(cellKey(rowIds[ri], columnIds[ci]));
        }
      }
      setSelectedCells(next);
      if (rowIds[r1]) lastSelectedCellRef.current = { rowId: anchorRowId, columnId: anchorColId };
    },
    [rowIds, columnIds]
  );

  const startPaint = useCallback((axis: "row" | "col", anchorIndex: number) => {
    paintAxisRef.current = axis;
    paintAnchorRef.current = anchorIndex;
  }, []);

  const startCellPaint = useCallback((rowId: string, columnId: string) => {
    paintAxisRef.current = "cell";
    paintCellAnchorRef.current = { rowId, columnId };
    setSelectedRows(new Set());
    setSelectedColumns(new Set());
    setSelectedCells(new Set([cellKey(rowId, columnId)]));
    lastSelectedCellRef.current = { rowId, columnId };
  }, []);

  const movePaint = useCallback(
    (currentIndex: number) => {
      if (paintAxisRef.current === null || paintAxisRef.current === "cell") return;
      if (paintAnchorRef.current === -1) return;
      if (paintAxisRef.current === "row") {
        paintSelectRows(paintAnchorRef.current, currentIndex);
      } else {
        paintSelectColumns(paintAnchorRef.current, currentIndex);
      }
    },
    [paintSelectRows, paintSelectColumns]
  );

  const moveCellPaint = useCallback(
    (rowId: string, columnId: string) => {
      if (paintAxisRef.current !== "cell" || !paintCellAnchorRef.current) return;
      paintSelectCells(paintCellAnchorRef.current.rowId, paintCellAnchorRef.current.columnId, rowId, columnId);
    },
    [paintSelectCells]
  );

  const endPaint = useCallback(() => {
    paintAxisRef.current = null;
    paintAnchorRef.current = -1;
    paintCellAnchorRef.current = null;
  }, []);

  const isPainting = useCallback(() => paintAxisRef.current !== null, []);

  const isCellSelected = useCallback(
    (rowId: string, columnId: string) => selectedCells.has(cellKey(rowId, columnId)),
    [selectedCells]
  );

  return {
    selectedRows,
    selectedColumns,
    selectedCells,
    selectRow,
    selectColumn,
    selectCell,
    isCellSelected,
    clearSelection,
    paintSelectRows,
    paintSelectColumns,
    paintSelectCells,
    startPaint,
    startCellPaint,
    movePaint,
    moveCellPaint,
    endPaint,
    isPainting,
  };
}
