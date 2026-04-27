"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { useDisclosure } from "@heroui/modal";
import { useAuth } from "@/hooks/use-auth";
import {
  useProductionTableWS,
  type RemoteEvent,
} from "@/hooks/use-production-table-ws";
import { ProductionTableGrid } from "@/components/production-table/ProductionTableGrid";
import { ProductionTableToolbar } from "@/components/production-table/ProductionTableToolbar";
import { ProductionTableShareModal } from "@/components/production-table/ProductionTableShareModal";
import ChatSidePanel from "@/components/chat/chat-side-panel";
import { siteConfig } from "@/config/site";
import { hasWriteAccess, isOwner as isOwnerCheck } from "@/lib/permissions";
import {
  MAX_PRODUCTION_TABLE_COLUMNS,
  MAX_PRODUCTION_TABLE_ROWS,
  type EnrichedProductionTable,
  type ProductionTableColumn,
  type ProductionTableRow,
  type EnrichedCell,
  type CellType,
  type CellComment,
  type EnrichedMediaAssetRef,
} from "@/lib/production-table/types";
import { createProductionTableStore, type ProductionTableStore } from "@/lib/production-table/store";
import { useOperationHistory } from "@/hooks/use-operation-history";
import { useUndoRedoKeyboard } from "@/hooks/use-undo-redo-keyboard";
import {
  applyCellUpdate,
  applyCellCommentUpdate,
  applyMediaAdd,
  applyMediaRemove,
  applyColumnRename,
  applyColumnResize,
  applyRowResize,
  applyColumnsReorder,
  applyRowsReorder,
  applyColumnDelete,
  applyRowDelete,
  applyColumnRestore,
  applyRowRestore,
  type PTDispatchDeps,
} from "@/lib/production-table/history";

const DEFAULT_CHAT_PANEL_WIDTH = 380;
const COLLAPSED_CHAT_WIDTH = 48;

export default function ProductionTableDetailPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = use(params);
  const router = useRouter();
  const t = useTranslations("productionTable");
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [table, setTable] = useState<EnrichedProductionTable | null>(null);
  const [loading, setLoading] = useState(true);

  // Cell-level Zustand store — stable reference for the lifetime of the page
  const storeRef = useRef<ProductionTableStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createProductionTableStore();
  }
  const store = storeRef.current;

  // Per-page operation history. Stacks are session-scoped and user-specific:
  // Ctrl+Z only replays the local user's actions, never collaborators'.
  const history = useOperationHistory();

  // Editable column/row IDs for granular permissions
  const [editableColumnIds, setEditableColumnIds] = useState<Set<string>>(
    new Set()
  );
  const [editableRowIds, setEditableRowIds] = useState<Set<string>>(new Set());

  const shareModal = useDisclosure();

  // Chat side panel state (mirrors desktop page pattern)
  const [isChatPanelCollapsed, setIsChatPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(siteConfig.chatPanelCollapsed) === "true";
  });
  const [chatPanelWidth, setChatPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_CHAT_PANEL_WIDTH;
    const stored = localStorage.getItem(siteConfig.chatPanelWidth);
    return stored ? parseInt(stored, 10) : DEFAULT_CHAT_PANEL_WIDTH;
  });

  const chatPanelActualWidth = isChatPanelCollapsed
    ? COLLAPSED_CHAT_WIDTH
    : chatPanelWidth;

  const handleChatPanelCollapseChange = useCallback((collapsed: boolean) => {
    setIsChatPanelCollapsed(collapsed);
    localStorage.setItem(siteConfig.chatPanelCollapsed, String(collapsed));
  }, []);

  const handleChatPanelWidthChange = useCallback((width: number) => {
    setChatPanelWidth(width);
    localStorage.setItem(siteConfig.chatPanelWidth, String(width));
  }, []);

  // Auto-expand chat panel when cells are sent to chat
  useEffect(() => {
    const expandChat = () => {
      if (isChatPanelCollapsed) {
        handleChatPanelCollapseChange(false);
      }
    };
    window.addEventListener("moodio-batch-to-chat", expandChat);
    return () => {
      window.removeEventListener("moodio-batch-to-chat", expandChat);
    };
  }, [isChatPanelCollapsed, handleChatPanelCollapseChange]);

  // Fetch table data
  const fetchTable = useCallback(async () => {
    try {
      const res = await fetch(`/api/production-table/${tableId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTable(data.table);
      store.getState().hydrate({
        columns: data.table.columns,
        rows: data.table.rows,
        cellMap: data.table.cellMap,
      });
      if (data.editableGrants) {
        setEditableColumnIds(new Set(data.editableGrants.columnIds ?? []));
        setEditableRowIds(new Set(data.editableGrants.rowIds ?? []));
      }
    } catch {
      addToast({ title: t("errors.failedToLoadTable"), color: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tableId, t, store]);

  useEffect(() => {
    fetchTable();
  }, [fetchTable]);

  // Handle remote WS events
  const onRemoteEvent = useCallback(
    (event: RemoteEvent) => {
      switch (event.type) {
        case "pt_cell_updated": {
          const { rowId, columnId, textContent, mediaAssets } = event.payload;
          const key = `${columnId}:${rowId}`;
          const existing = store.getState().cellMap[key];
          store.getState().setCell(key, {
            ...(existing ?? {
              id: "",
              tableId,
              columnId,
              rowId,
              updatedAt: new Date(),
              updatedBy: event.userId,
            }),
            textContent: textContent ?? existing?.textContent ?? null,
            mediaAssets: mediaAssets ?? existing?.mediaAssets ?? null,
          } as EnrichedCell);
          break;
        }
        case "pt_media_asset_added": {
          const { rowId, columnId, asset } = event.payload;
          const key = `${columnId}:${rowId}`;
          store.getState().addMediaAsset(key, asset, {
            id: "",
            tableId,
            columnId,
            rowId,
            textContent: null,
            updatedAt: new Date(),
            updatedBy: event.userId,
          });
          break;
        }
        case "pt_media_asset_removed": {
          const { rowId, columnId, assetId } = event.payload;
          const key = `${columnId}:${rowId}`;
          store.getState().removeMediaAsset(key, assetId);
          break;
        }
        case "pt_cell_comment_updated": {
          const { rowId, columnId, comment } = event.payload;
          const key = `${columnId}:${rowId}`;
          store.getState().updateCellComment(key, comment ?? null, {
            id: "",
            tableId,
            columnId,
            rowId,
            textContent: null,
            mediaAssets: null,
            updatedAt: new Date(),
            updatedBy: event.userId,
          });
          break;
        }
        case "pt_column_added": {
          const { column } = event.payload;
          setTable((prev) =>
            prev ? { ...prev, columns: [...prev.columns, column] } : prev
          );
          store.getState().setColumns([...store.getState().columns, column]);
          break;
        }
        case "pt_column_removed": {
          const { columnId } = event.payload;
          setTable((prev) =>
            prev
              ? {
                  ...prev,
                  columns: prev.columns.filter((c) => c.id !== columnId),
                }
              : prev
          );
          store.getState().setColumns(store.getState().columns.filter((c) => c.id !== columnId));
          break;
        }
        case "pt_column_renamed": {
          const { columnId, name } = event.payload;
          setTable((prev) =>
            prev
              ? {
                  ...prev,
                  columns: prev.columns.map((c) =>
                    c.id === columnId ? { ...c, name } : c
                  ),
                }
              : prev
          );
          break;
        }
        case "pt_column_resized": {
          const { columnId, width } = event.payload;
          setTable((prev) =>
            prev
              ? {
                  ...prev,
                  columns: prev.columns.map((c) =>
                    c.id === columnId ? { ...c, width: width as number } : c
                  ),
                }
              : prev
          );
          break;
        }
        case "pt_columns_reordered": {
          const { columnIds } = event.payload;
          setTable((prev) => {
            if (!prev) return prev;
            const colMap = new Map(prev.columns.map((c) => [c.id, c]));
            const reordered = (columnIds as string[])
              .map((id) => colMap.get(id))
              .filter(Boolean) as ProductionTableColumn[];
            return { ...prev, columns: reordered };
          });
          break;
        }
        case "pt_row_added": {
          const { row } = event.payload;
          setTable((prev) =>
            prev ? { ...prev, rows: [...prev.rows, row] } : prev
          );
          store.getState().setRows([...store.getState().rows, row]);
          break;
        }
        case "pt_row_removed": {
          const { rowId } = event.payload;
          setTable((prev) =>
            prev
              ? { ...prev, rows: prev.rows.filter((r) => r.id !== rowId) }
              : prev
          );
          store.getState().setRows(store.getState().rows.filter((r) => r.id !== rowId));
          break;
        }
        case "pt_row_resized": {
          const { rowId, height } = event.payload;
          setTable((prev) =>
            prev
              ? {
                  ...prev,
                  rows: prev.rows.map((r) =>
                    r.id === rowId ? { ...r, height: height as number } : r
                  ),
                }
              : prev
          );
          break;
        }
        case "pt_rows_reordered": {
          const { rowIds } = event.payload;
          setTable((prev) => {
            if (!prev) return prev;
            const rowMap = new Map(prev.rows.map((r) => [r.id, r]));
            const reordered = (rowIds as string[])
              .map((id) => rowMap.get(id))
              .filter(Boolean) as ProductionTableRow[];
            return { ...prev, rows: reordered };
          });
          break;
        }
      }
    },
    [tableId, store]
  );

  const {
    connectionState,
    sendEvent,
    connectedUsers,
    cellLocks,
    remoteCursors,
  } = useProductionTableWS({
    tableId,
    enabled: !!table,
    onRemoteEvent,
    fetchDetail: fetchTable,
  });

  // Sync WS cell locks into the Zustand store so cells can self-subscribe
  useEffect(() => {
    store.setState({ cellLocks });
  }, [cellLocks, store]);

  // Dispatcher deps bundle used by the history adapters. `setTable` is the
  // page's own state setter so column/row mutations flow through one place.
  const historyDepsRef = useRef<PTDispatchDeps>({
    tableId,
    store,
    sendEvent,
    setTable,
    currentUserId: currentUserId ?? null,
  });
  historyDepsRef.current = {
    tableId,
    store,
    sendEvent,
    setTable,
    currentUserId: currentUserId ?? null,
  };

  // Ctrl+Z / Ctrl+Shift+Z. Disabled when the local user holds a cell lock
  // (they're actively editing — the browser's native text undo should win).
  useUndoRedoKeyboard({
    history,
    disabled: useCallback(() => {
      if (!currentUserId) return false;
      for (const lock of cellLocks.values()) {
        if (lock.userId === currentUserId) return true;
      }
      return false;
    }, [currentUserId, cellLocks]),
  });

  // Permission checks
  const tablePermission = table?.permission ?? null;
  const canEditStructure = hasWriteAccess(tablePermission);
  const isTableOwner = isOwnerCheck(tablePermission);
  const canAddRows = (table?.rows.length ?? 0) < MAX_PRODUCTION_TABLE_ROWS;
  const canAddColumns =
    (table?.columns.length ?? 0) < MAX_PRODUCTION_TABLE_COLUMNS;
  const rowLimitError = t("errors.maxRowsReached", {
    count: MAX_PRODUCTION_TABLE_ROWS,
  });
  const columnLimitError = t("errors.maxColumnsReached", {
    count: MAX_PRODUCTION_TABLE_COLUMNS,
  });

  const resolveApiErrorMessage = useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof Error) {
        if (error.message === "PT_MAX_ROWS_REACHED") return rowLimitError;
        if (error.message === "PT_MAX_COLUMNS_REACHED") return columnLimitError;
      }
      return fallback;
    },
    [rowLimitError, columnLimitError]
  );

  const canEditCell = useCallback(
    (rowId: string, columnId: string) => {
      if (canEditStructure) return true;
      if (editableColumnIds.has(columnId)) return true;
      if (editableRowIds.has(rowId)) return true;
      return false;
    },
    [canEditStructure, editableColumnIds, editableRowIds]
  );

  // Actions
  const handleAddColumn = useCallback(
    async (cellType: CellType, count: number = 1) => {
      if (!canAddColumns) {
        addToast({ title: columnLimitError, color: "danger" });
        return;
      }
      const currentCount = table?.columns.length ?? 0;
      const actualCount = Math.min(
        Math.max(1, count),
        MAX_PRODUCTION_TABLE_COLUMNS - currentCount
      );
      if (actualCount <= 0) {
        addToast({ title: columnLimitError, color: "danger" });
        return;
      }
      for (let i = 0; i < actualCount; i++) {
        try {
          const res = await fetch(
            `/api/production-table/${tableId}/columns`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `Column ${currentCount + i + 1}`, cellType }),
            }
          );
          const data = (await res
            .json()
            .catch(() => null)) as {
            column?: ProductionTableColumn;
            errorCode?: string;
          } | null;
          if (!res.ok || !data?.column) {
            throw new Error(data?.errorCode || "UNKNOWN_ERROR");
          }
          const newColumn = data.column;
          setTable((prev) =>
            prev ? { ...prev, columns: [...prev.columns, newColumn] } : prev
          );
          store.getState().setColumns([...store.getState().columns, newColumn]);
          sendEvent("pt_column_added", { tableId, column: newColumn });

          // Undo restores the column with its original id; redo deletes it again.
          const insertIndex = (table?.columns.length ?? 0) + i;
          history.record({
            userId: currentUserId ?? "",
            label: "Add column",
            targetIds: [newColumn.id],
            forward: () =>
              applyColumnRestore(historyDepsRef.current, newColumn, [], insertIndex),
            inverse: () => applyColumnDelete(historyDepsRef.current, newColumn.id),
          });
        } catch (error) {
          const message = resolveApiErrorMessage(
            error,
            t("errors.failedToAddColumn")
          );
          addToast({ title: message, color: "danger" });
          break;
        }
      }
    },
    [
      canAddColumns,
      columnLimitError,
      tableId,
      table?.columns.length,
      sendEvent,
      resolveApiErrorMessage,
      t,
      store,
      history,
      currentUserId,
    ]
  );

  const handleAddRow = useCallback(async (count: number = 1) => {
    if (!canAddRows) {
      addToast({ title: rowLimitError, color: "danger" });
      return;
    }
    const currentCount = table?.rows.length ?? 0;
    const actualCount = Math.min(
      Math.max(1, count),
      MAX_PRODUCTION_TABLE_ROWS - currentCount
    );
    if (actualCount <= 0) {
      addToast({ title: rowLimitError, color: "danger" });
      return;
    }
    for (let i = 0; i < actualCount; i++) {
      try {
        const res = await fetch(`/api/production-table/${tableId}/rows`, {
          method: "POST",
        });
        const data = (await res
          .json()
          .catch(() => null)) as {
          row?: ProductionTableRow;
          errorCode?: string;
        } | null;
        if (!res.ok || !data?.row) {
          throw new Error(data?.errorCode || "UNKNOWN_ERROR");
        }
        const newRow = data.row;
        setTable((prev) =>
          prev ? { ...prev, rows: [...prev.rows, newRow] } : prev
        );
        store.getState().setRows([...store.getState().rows, newRow]);
        sendEvent("pt_row_added", { tableId, row: newRow });

        const insertIndex = (table?.rows.length ?? 0) + i;
        history.record({
          userId: currentUserId ?? "",
          label: "Add row",
          targetIds: [newRow.id],
          forward: () =>
            applyRowRestore(historyDepsRef.current, newRow, [], insertIndex),
          inverse: () => applyRowDelete(historyDepsRef.current, newRow.id),
        });
      } catch (error) {
        const message = resolveApiErrorMessage(error, t("errors.failedToAddRow"));
        addToast({ title: message, color: "danger" });
        break;
      }
    }
  }, [
    canAddRows,
    rowLimitError,
    tableId,
    table?.rows.length,
    sendEvent,
    resolveApiErrorMessage,
    t,
    store,
    history,
    currentUserId,
  ]);

  const handleInsertRow = useCallback(
    async (anchorRowId: string, position: "above" | "below") => {
      if (!table) return;
      if (!canAddRows) {
        addToast({ title: rowLimitError, color: "danger" });
        return;
      }
      try {
        const res = await fetch(`/api/production-table/${tableId}/rows`, {
          method: "POST",
        });
        const data = (await res
          .json()
          .catch(() => null)) as {
          row?: ProductionTableRow;
          errorCode?: string;
        } | null;
        if (!res.ok || !data?.row) {
          throw new Error(data?.errorCode || "UNKNOWN_ERROR");
        }
        const newRow = data.row as ProductionTableRow;

        const anchorIndex = table.rows.findIndex((r) => r.id === anchorRowId);
        const insertAt = position === "above" ? anchorIndex : anchorIndex + 1;
        const newRows = [...table.rows];
        newRows.splice(insertAt, 0, newRow);

        setTable((prev) => (prev ? { ...prev, rows: newRows } : prev));
        store.getState().setRows(newRows);
        sendEvent("pt_row_added", { tableId, row: newRow });

        const newIds = newRows.map((r) => r.id);
        sendEvent("pt_rows_reordered", { tableId, rowIds: newIds });
        await fetch(`/api/production-table/${tableId}/rows/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowIds: newIds }),
        });
      } catch (error) {
        const message = resolveApiErrorMessage(
          error,
          t("errors.failedToInsertRow")
        );
        addToast({ title: message, color: "danger" });
      }
    },
    [
      table,
      canAddRows,
      rowLimitError,
      tableId,
      sendEvent,
      resolveApiErrorMessage,
      t,
    ]
  );

  const handleInsertColumn = useCallback(
    async (anchorColumnId: string, position: "left" | "right", cellType: CellType) => {
      if (!table) return;
      if (!canAddColumns) {
        addToast({ title: columnLimitError, color: "danger" });
        return;
      }
      try {
        const res = await fetch(
          `/api/production-table/${tableId}/columns`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: `Column ${(table.columns.length ?? 0) + 1}`,
              cellType,
            }),
          }
        );
        const data = (await res
          .json()
          .catch(() => null)) as {
          column?: ProductionTableColumn;
          errorCode?: string;
        } | null;
        if (!res.ok || !data?.column) {
          throw new Error(data?.errorCode || "UNKNOWN_ERROR");
        }
        const newCol = data.column as ProductionTableColumn;

        const anchorIndex = table.columns.findIndex((c) => c.id === anchorColumnId);
        const insertAt = position === "left" ? anchorIndex : anchorIndex + 1;
        const newCols = [...table.columns];
        newCols.splice(insertAt, 0, newCol);

        setTable((prev) => (prev ? { ...prev, columns: newCols } : prev));
        store.getState().setColumns(newCols);
        sendEvent("pt_column_added", { tableId, column: newCol });

        const newIds = newCols.map((c) => c.id);
        sendEvent("pt_columns_reordered", { tableId, columnIds: newIds });
        await fetch(`/api/production-table/${tableId}/columns/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnIds: newIds }),
        });
      } catch (error) {
        const message = resolveApiErrorMessage(
          error,
          t("errors.failedToInsertColumn")
        );
        addToast({ title: message, color: "danger" });
      }
    },
    [
      table,
      canAddColumns,
      columnLimitError,
      tableId,
      sendEvent,
      resolveApiErrorMessage,
      t,
    ]
  );

  const handleCellCommit = useCallback(
    async (
      columnId: string,
      rowId: string,
      textContent?: string | null,
      mediaAssets?: EnrichedMediaAssetRef[] | null
    ) => {
      const key = `${columnId}:${rowId}`;
      const prev = store.getState().cellMap[key];
      const prevText = prev?.textContent ?? null;
      const prevMedia = prev?.mediaAssets ?? null;

      const result = await applyCellUpdate(
        historyDepsRef.current,
        columnId,
        rowId,
        textContent,
        mediaAssets
      );
      if (!result.ok) {
        addToast({ title: t("errors.failedToSaveCell"), color: "danger" });
        return;
      }

      const changedText = textContent !== undefined && prevText !== textContent;
      const changedMedia = mediaAssets !== undefined && prevMedia !== mediaAssets;
      if (changedText || changedMedia) {
        history.record({
          userId: currentUserId ?? "",
          label: "Edit cell",
          coalesceKey: `pt-cell:${columnId}:${rowId}`,
          targetIds: [key],
          forward: () =>
            applyCellUpdate(
              historyDepsRef.current,
              columnId,
              rowId,
              textContent,
              mediaAssets
            ),
          inverse: () =>
            applyCellUpdate(
              historyDepsRef.current,
              columnId,
              rowId,
              prevText,
              prevMedia
            ),
        });
      }
    },
    [store, history, currentUserId, t]
  );

  const handleMediaAssetAdd = useCallback(
    async (columnId: string, rowId: string, asset: EnrichedMediaAssetRef) => {
      const key = `${columnId}:${rowId}`;
      const result = await applyMediaAdd(historyDepsRef.current, columnId, rowId, asset);
      if (!result.ok) {
        addToast({ title: t("errors.failedToAddMedia"), color: "danger" });
        return;
      }
      history.record({
        userId: currentUserId ?? "",
        label: "Add media",
        targetIds: [key],
        forward: () =>
          applyMediaAdd(historyDepsRef.current, columnId, rowId, asset),
        inverse: () =>
          applyMediaRemove(historyDepsRef.current, columnId, rowId, asset.assetId),
      });
    },
    [history, currentUserId, t]
  );

  const handleMediaAssetRemove = useCallback(
    async (columnId: string, rowId: string, assetId: string) => {
      const key = `${columnId}:${rowId}`;
      // Snapshot the asset so undo restores the same reference.
      const prevAsset = (store.getState().cellMap[key]?.mediaAssets ?? [])
        .find((a) => a.assetId === assetId);

      const result = await applyMediaRemove(historyDepsRef.current, columnId, rowId, assetId);
      if (!result.ok) {
        addToast({ title: t("errors.failedToRemoveMedia"), color: "danger" });
        return;
      }
      if (prevAsset) {
        history.record({
          userId: currentUserId ?? "",
          label: "Remove media",
          targetIds: [key],
          forward: () =>
            applyMediaRemove(historyDepsRef.current, columnId, rowId, assetId),
          inverse: () =>
            applyMediaAdd(historyDepsRef.current, columnId, rowId, prevAsset),
        });
      }
    },
    [store, history, currentUserId, t]
  );

  const handleCommentSave = useCallback(
    async (columnId: string, rowId: string, text: string | null) => {
      const stamped: CellComment | null = text
        ? {
            text,
            authorId: currentUserId ?? "",
            authorName: user?.firstName || user?.email || "",
            updatedAt: new Date().toISOString(),
          }
        : null;
      const key = `${columnId}:${rowId}`;
      const prevComment = store.getState().cellMap[key]?.comment ?? null;

      const result = await applyCellCommentUpdate(
        historyDepsRef.current,
        columnId,
        rowId,
        stamped
      );
      if (!result.ok) {
        addToast({ title: t("errors.failedToSaveComment"), color: "danger" });
        return;
      }
      history.record({
        userId: currentUserId ?? "",
        label: "Edit comment",
        coalesceKey: `pt-comment:${columnId}:${rowId}`,
        targetIds: [key],
        forward: () =>
          applyCellCommentUpdate(historyDepsRef.current, columnId, rowId, stamped),
        inverse: () =>
          applyCellCommentUpdate(historyDepsRef.current, columnId, rowId, prevComment),
      });
    },
    [store, history, currentUserId, user, t]
  );

  const handleRenameColumn = useCallback(
    async (columnId: string, name: string) => {
      const prevName = table?.columns.find((c) => c.id === columnId)?.name ?? "";
      const result = await applyColumnRename(historyDepsRef.current, columnId, name);
      if (!result.ok) {
        addToast({ title: t("errors.failedToRenameColumn"), color: "danger" });
        return;
      }
      if (prevName !== name) {
        history.record({
          userId: currentUserId ?? "",
          label: "Rename column",
          coalesceKey: `pt-colname:${columnId}`,
          targetIds: [columnId],
          forward: () => applyColumnRename(historyDepsRef.current, columnId, name),
          inverse: () => applyColumnRename(historyDepsRef.current, columnId, prevName),
        });
      }
    },
    [table?.columns, history, currentUserId, t]
  );

  const handleDeleteColumn = useCallback(
    async (columnId: string) => {
      if (!table) return;
      const column = table.columns.find((c) => c.id === columnId);
      if (!column) return;
      const insertIndex = table.columns.findIndex((c) => c.id === columnId);
      // Snapshot every cell in this column so undo can restore content too.
      const snapshot: EnrichedCell[] = Object.values(store.getState().cellMap).filter(
        (c) => c.columnId === columnId
      );

      const result = await applyColumnDelete(historyDepsRef.current, columnId);
      if (!result.ok) {
        addToast({ title: t("errors.failedToDeleteColumn"), color: "danger" });
        return;
      }
      history.record({
        userId: currentUserId ?? "",
        label: "Delete column",
        targetIds: [columnId],
        forward: () => applyColumnDelete(historyDepsRef.current, columnId),
        inverse: () =>
          applyColumnRestore(historyDepsRef.current, column, snapshot, insertIndex),
      });
    },
    [table, store, history, currentUserId, t]
  );

  const handleDeleteRow = useCallback(
    async (rowId: string) => {
      if (!table) return;
      const row = table.rows.find((r) => r.id === rowId);
      if (!row) return;
      const insertIndex = table.rows.findIndex((r) => r.id === rowId);
      const snapshot: EnrichedCell[] = Object.values(store.getState().cellMap).filter(
        (c) => c.rowId === rowId
      );

      const result = await applyRowDelete(historyDepsRef.current, rowId);
      if (!result.ok) {
        addToast({ title: t("errors.failedToDeleteRow"), color: "danger" });
        return;
      }
      history.record({
        userId: currentUserId ?? "",
        label: "Delete row",
        targetIds: [rowId],
        forward: () => applyRowDelete(historyDepsRef.current, rowId),
        inverse: () =>
          applyRowRestore(historyDepsRef.current, row, snapshot, insertIndex),
      });
    },
    [table, store, history, currentUserId, t]
  );

  const handleBulkDeleteRows = useCallback(
    async (rowIds: string[]) => {
      const idSet = new Set(rowIds);
      setTable((prev) =>
        prev
          ? { ...prev, rows: prev.rows.filter((r) => !idSet.has(r.id)) }
          : prev
      );
      store.getState().setRows(store.getState().rows.filter((r) => !idSet.has(r.id)));
      for (const rowId of rowIds) {
        sendEvent("pt_row_removed", { tableId, rowId });
        fetch(`/api/production-table/${tableId}/rows/${rowId}`, { method: "DELETE" }).catch(() => {});
      }
    },
    [tableId, sendEvent, store]
  );

  const handleBulkDeleteColumns = useCallback(
    async (columnIds: string[]) => {
      const idSet = new Set(columnIds);
      setTable((prev) =>
        prev
          ? { ...prev, columns: prev.columns.filter((c) => !idSet.has(c.id)) }
          : prev
      );
      store.getState().setColumns(store.getState().columns.filter((c) => !idSet.has(c.id)));
      for (const columnId of columnIds) {
        sendEvent("pt_column_removed", { tableId, columnId });
        fetch(`/api/production-table/${tableId}/columns/${columnId}`, { method: "DELETE" }).catch(() => {});
      }
    },
    [tableId, sendEvent, store]
  );

  // Column resize
  const handleResizeColumn = useCallback(
    async (columnId: string, width: number) => {
      const prevWidth = table?.columns.find((c) => c.id === columnId)?.width;
      const result = await applyColumnResize(historyDepsRef.current, columnId, width);
      if (!result.ok) {
        addToast({ title: t("errors.failedToResizeColumn"), color: "danger" });
        return;
      }
      if (prevWidth != null && prevWidth !== width) {
        history.record({
          userId: currentUserId ?? "",
          label: "Resize column",
          coalesceKey: `pt-colwidth:${columnId}`,
          targetIds: [columnId],
          forward: () => applyColumnResize(historyDepsRef.current, columnId, width),
          inverse: () => applyColumnResize(historyDepsRef.current, columnId, prevWidth),
        });
      }
    },
    [table?.columns, history, currentUserId, t]
  );

  // Row resize
  const handleResizeRow = useCallback(
    async (rowId: string, height: number) => {
      const prevHeight = table?.rows.find((r) => r.id === rowId)?.height;
      const result = await applyRowResize(historyDepsRef.current, rowId, height);
      if (!result.ok) {
        addToast({ title: t("errors.failedToResizeRow"), color: "danger" });
        return;
      }
      if (prevHeight != null && prevHeight !== height) {
        history.record({
          userId: currentUserId ?? "",
          label: "Resize row",
          coalesceKey: `pt-rowheight:${rowId}`,
          targetIds: [rowId],
          forward: () => applyRowResize(historyDepsRef.current, rowId, height),
          inverse: () => applyRowResize(historyDepsRef.current, rowId, prevHeight),
        });
      }
    },
    [table?.rows, history, currentUserId, t]
  );

  const handleBulkResizeRows = useCallback(
    async (rowIds: string[], height: number) => {
      const idSet = new Set(rowIds);
      setTable((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                idSet.has(r.id) ? { ...r, height } : r
              ),
            }
          : prev
      );
      for (const rowId of rowIds) {
        sendEvent("pt_row_resized", { tableId, rowId, height });
        fetch(`/api/production-table/${tableId}/rows/${rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ height }),
        }).catch(() => {});
      }
    },
    [tableId, sendEvent]
  );

  const handleBulkResizeColumns = useCallback(
    async (columnIds: string[], width: number) => {
      const idSet = new Set(columnIds);
      setTable((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((c) =>
                idSet.has(c.id) ? { ...c, width } : c
              ),
            }
          : prev
      );
      for (const columnId of columnIds) {
        sendEvent("pt_column_resized", { tableId, columnId, width });
        fetch(`/api/production-table/${tableId}/columns/${columnId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ width }),
        }).catch(() => {});
      }
    },
    [tableId, sendEvent]
  );

  // Column reorder (called by grid after drag-and-drop completes)
  const handleReorderColumns = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!table) return;
      const prevIds = table.columns.map((c) => c.id);
      const cols = [...table.columns];
      const [moved] = cols.splice(fromIndex, 1);
      cols.splice(toIndex, 0, moved);
      const newIds = cols.map((c) => c.id);

      const result = await applyColumnsReorder(historyDepsRef.current, newIds);
      if (!result.ok) {
        addToast({ title: t("errors.failedToReorderColumns"), color: "danger" });
        return;
      }
      history.record({
        userId: currentUserId ?? "",
        label: "Reorder columns",
        targetIds: newIds,
        forward: () => applyColumnsReorder(historyDepsRef.current, newIds),
        inverse: () => applyColumnsReorder(historyDepsRef.current, prevIds),
      });
    },
    [table, history, currentUserId, t]
  );

  // Row reorder (called by grid after drag-and-drop completes)
  const handleReorderRows = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!table) return;
      const prevIds = table.rows.map((r) => r.id);
      const rowsCopy = [...table.rows];
      const [moved] = rowsCopy.splice(fromIndex, 1);
      rowsCopy.splice(toIndex, 0, moved);
      const newIds = rowsCopy.map((r) => r.id);

      const result = await applyRowsReorder(historyDepsRef.current, newIds);
      if (!result.ok) {
        addToast({ title: t("errors.failedToReorderRows"), color: "danger" });
        return;
      }
      history.record({
        userId: currentUserId ?? "",
        label: "Reorder rows",
        targetIds: newIds,
        forward: () => applyRowsReorder(historyDepsRef.current, newIds),
        inverse: () => applyRowsReorder(historyDepsRef.current, prevIds),
      });
    },
    [table, history, currentUserId, t]
  );

  const handleBulkReorderRows = useCallback(
    async (newRowIds: string[]) => {
      if (!table) return;
      const prevIds = table.rows.map((r) => r.id);
      const result = await applyRowsReorder(historyDepsRef.current, newRowIds);
      if (!result.ok) {
        addToast({ title: t("errors.failedToReorderRows"), color: "danger" });
        return;
      }
      history.record({
        userId: currentUserId ?? "",
        label: "Reorder rows",
        targetIds: newRowIds,
        forward: () => applyRowsReorder(historyDepsRef.current, newRowIds),
        inverse: () => applyRowsReorder(historyDepsRef.current, prevIds),
      });
    },
    [table, history, currentUserId, t]
  );

  const handleBulkReorderColumns = useCallback(
    async (newColumnIds: string[]) => {
      if (!table) return;
      const prevIds = table.columns.map((c) => c.id);
      const result = await applyColumnsReorder(historyDepsRef.current, newColumnIds);
      if (!result.ok) {
        addToast({ title: t("errors.failedToReorderColumns"), color: "danger" });
        return;
      }
      history.record({
        userId: currentUserId ?? "",
        label: "Reorder columns",
        targetIds: newColumnIds,
        forward: () => applyColumnsReorder(historyDepsRef.current, newColumnIds),
        inverse: () => applyColumnsReorder(historyDepsRef.current, prevIds),
      });
    },
    [table, history, currentUserId, t]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!table) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-default-500">{t("tableNotFoundOrAccessDenied")}</p>
        <Button variant="flat" onPress={() => router.push("/production-table")}>
          {t("backToTables")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="relative flex-1 min-w-0 h-full flex flex-col">
        <ProductionTableToolbar
          tableName={table.name}
          connectionState={connectionState}
          connectedUsers={connectedUsers}
          canEdit={canEditStructure}
          canAddColumns={canAddColumns}
          canAddRows={canAddRows}
          currentRowCount={table.rows.length}
          currentColumnCount={table.columns.length}
          onBack={() => router.push("/production-table")}
          onAddColumn={handleAddColumn}
          onAddRow={handleAddRow}
          onShare={shareModal.onOpen}
        />
        <ProductionTableGrid
          columns={table.columns}
          rows={table.rows}
          store={store}
          remoteCursors={remoteCursors}
          currentUserId={currentUserId}
          canEditCell={canEditCell}
          canEditStructure={canEditStructure}
          editableColumnIds={editableColumnIds}
          editableRowIds={editableRowIds}
          sendEvent={sendEvent}
          onCellCommit={handleCellCommit}
          onMediaAssetAdd={handleMediaAssetAdd}
          onMediaAssetRemove={handleMediaAssetRemove}
          onCommentSave={handleCommentSave}
          onRenameColumn={handleRenameColumn}
          onDeleteColumn={handleDeleteColumn}
          onDeleteRow={handleDeleteRow}
          onBulkDeleteRows={handleBulkDeleteRows}
          onBulkDeleteColumns={handleBulkDeleteColumns}
          onReorderColumns={handleReorderColumns}
          onReorderRows={handleReorderRows}
          onBulkReorderRows={handleBulkReorderRows}
          onBulkReorderColumns={handleBulkReorderColumns}
          onResizeColumn={handleResizeColumn}
          onResizeRow={handleResizeRow}
          onBulkResizeRows={handleBulkResizeRows}
          onBulkResizeColumns={handleBulkResizeColumns}
          onAddColumn={handleAddColumn}
          onAddRow={handleAddRow}
          onInsertRow={handleInsertRow}
          onInsertColumn={handleInsertColumn}
          canAddColumns={canAddColumns}
          canAddRows={canAddRows}
        />
        <ProductionTableShareModal
          isOpen={shareModal.isOpen}
          onClose={shareModal.onClose}
          tableId={tableId}
          ownerId={table.userId}
          columns={table.columns}
          rows={table.rows}
          isOwner={isTableOwner}
        />
      </div>

      <div
        className="hidden lg:block shrink-0 min-h-0 z-60"
        style={{
          width: chatPanelActualWidth,
          transition: isChatPanelCollapsed ? "width 0.3s ease-in-out" : undefined,
        }}
      >
        <ChatSidePanel
          defaultExpanded={!isChatPanelCollapsed}
          onCollapseChange={handleChatPanelCollapseChange}
          onWidthChange={handleChatPanelWidthChange}
        />
      </div>
    </div>
  );
}
