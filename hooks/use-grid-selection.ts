"use client";

import { useState, useCallback, useRef } from "react";

export type SelectMode = "replace" | "toggle" | "range";

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
  const lastSelectedRowRef = useRef<string | null>(null);
  const lastSelectedColRef = useRef<string | null>(null);

  // Paint-select tracking
  const paintAxisRef = useRef<"row" | "col" | null>(null);
  const paintAnchorRef = useRef<number>(-1);

  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
    setSelectedColumns(new Set());
    lastSelectedRowRef.current = null;
    lastSelectedColRef.current = null;
    paintAxisRef.current = null;
  }, []);

  const selectRow = useCallback(
    (id: string, mode: SelectMode) => {
      setSelectedColumns(new Set());
      lastSelectedColRef.current = null;

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
      lastSelectedRowRef.current = null;

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

  const startPaint = useCallback((axis: "row" | "col", anchorIndex: number) => {
    paintAxisRef.current = axis;
    paintAnchorRef.current = anchorIndex;
  }, []);

  const movePaint = useCallback(
    (currentIndex: number) => {
      if (paintAxisRef.current === null || paintAnchorRef.current === -1) return;
      if (paintAxisRef.current === "row") {
        paintSelectRows(paintAnchorRef.current, currentIndex);
      } else {
        paintSelectColumns(paintAnchorRef.current, currentIndex);
      }
    },
    [paintSelectRows, paintSelectColumns]
  );

  const endPaint = useCallback(() => {
    paintAxisRef.current = null;
    paintAnchorRef.current = -1;
  }, []);

  const isPainting = useCallback(() => paintAxisRef.current !== null, []);

  return {
    selectedRows,
    selectedColumns,
    selectRow,
    selectColumn,
    clearSelection,
    paintSelectRows,
    paintSelectColumns,
    startPaint,
    movePaint,
    endPaint,
    isPainting,
  };
}
