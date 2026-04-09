"use client";

import { use, useCallback, useEffect, useState } from "react";
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
      if (data.editableGrants) {
        setEditableColumnIds(new Set(data.editableGrants.columnIds ?? []));
        setEditableRowIds(new Set(data.editableGrants.rowIds ?? []));
      }
    } catch {
      addToast({ title: t("errors.failedToLoadTable"), color: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tableId, t]);

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
          setTable((prev) => {
            if (!prev) return prev;
            const newMap = { ...prev.cellMap };
            newMap[key] = {
              ...(newMap[key] ?? {
                id: "",
                tableId,
                columnId,
                rowId,
                updatedAt: new Date(),
                updatedBy: event.userId,
              }),
              textContent: textContent ?? newMap[key]?.textContent ?? null,
              mediaAssets: mediaAssets ?? newMap[key]?.mediaAssets ?? null,
            } as EnrichedCell;
            return { ...prev, cellMap: newMap };
          });
          break;
        }
        case "pt_media_asset_added": {
          const { rowId, columnId, asset } = event.payload;
          const key = `${columnId}:${rowId}`;
          setTable((prev) => {
            if (!prev) return prev;
            const newMap = { ...prev.cellMap };
            const existing = newMap[key];
            const currentAssets = (existing?.mediaAssets as EnrichedMediaAssetRef[]) ?? [];
            newMap[key] = {
              ...(existing ?? {
                id: "",
                tableId,
                columnId,
                rowId,
                textContent: null,
                updatedAt: new Date(),
                updatedBy: event.userId,
              }),
              mediaAssets: [...currentAssets, asset],
            } as EnrichedCell;
            return { ...prev, cellMap: newMap };
          });
          break;
        }
        case "pt_media_asset_removed": {
          const { rowId, columnId, assetId } = event.payload;
          const key = `${columnId}:${rowId}`;
          setTable((prev) => {
            if (!prev) return prev;
            const newMap = { ...prev.cellMap };
            const existing = newMap[key];
            if (!existing) return prev;
            const currentAssets = (existing.mediaAssets as EnrichedMediaAssetRef[]) ?? [];
            newMap[key] = {
              ...existing,
              mediaAssets: currentAssets.filter((a: EnrichedMediaAssetRef) => a.assetId !== assetId),
            } as EnrichedCell;
            return { ...prev, cellMap: newMap };
          });
          break;
        }
        case "pt_cell_comment_updated": {
          const { rowId, columnId, comment } = event.payload;
          const key = `${columnId}:${rowId}`;
          setTable((prev) => {
            if (!prev) return prev;
            const newMap = { ...prev.cellMap };
            newMap[key] = {
              ...(newMap[key] ?? {
                id: "",
                tableId,
                columnId,
                rowId,
                textContent: null,
                mediaAssets: null,
                updatedAt: new Date(),
                updatedBy: event.userId,
              }),
              comment: comment ?? null,
            } as EnrichedCell;
            return { ...prev, cellMap: newMap };
          });
          break;
        }
        case "pt_column_added": {
          const { column } = event.payload;
          setTable((prev) =>
            prev ? { ...prev, columns: [...prev.columns, column] } : prev
          );
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
          break;
        }
        case "pt_row_removed": {
          const { rowId } = event.payload;
          setTable((prev) =>
            prev
              ? { ...prev, rows: prev.rows.filter((r) => r.id !== rowId) }
              : prev
          );
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
    [tableId]
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
    async (cellType: CellType) => {
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
            body: JSON.stringify({ name: `Column ${(table?.columns.length ?? 0) + 1}`, cellType }),
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
        sendEvent("pt_column_added", { tableId, column: newColumn });
      } catch (error) {
        const message = resolveApiErrorMessage(
          error,
          t("errors.failedToAddColumn")
        );
        addToast({ title: message, color: "danger" });
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
    ]
  );

  const handleAddRow = useCallback(async () => {
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
      const newRow = data.row;
      setTable((prev) =>
        prev ? { ...prev, rows: [...prev.rows, newRow] } : prev
      );
      sendEvent("pt_row_added", { tableId, row: newRow });
    } catch (error) {
      const message = resolveApiErrorMessage(error, t("errors.failedToAddRow"));
      addToast({ title: message, color: "danger" });
    }
  }, [
    canAddRows,
    rowLimitError,
    tableId,
    sendEvent,
    resolveApiErrorMessage,
    t,
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
      // Optimistic update
      const key = `${columnId}:${rowId}`;
      setTable((prev) => {
        if (!prev) return prev;
        const newMap = { ...prev.cellMap };
        newMap[key] = {
          ...(newMap[key] ?? {
            id: "",
            tableId,
            columnId,
            rowId,
            updatedAt: new Date(),
            updatedBy: currentUserId ?? null,
          }),
          textContent: textContent ?? newMap[key]?.textContent ?? null,
          mediaAssets: mediaAssets ?? newMap[key]?.mediaAssets ?? null,
        } as EnrichedCell;
        return { ...prev, cellMap: newMap };
      });

      sendEvent("pt_cell_updated", {
        tableId,
        rowId,
        columnId,
        textContent,
        mediaAssets,
      });

      try {
        await fetch(`/api/production-table/${tableId}/cells`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnId, rowId, textContent, mediaAssets }),
        });
      } catch {
        addToast({ title: t("errors.failedToSaveCell"), color: "danger" });
      }
    },
    [tableId, currentUserId, sendEvent, t]
  );

  const handleMediaAssetAdd = useCallback(
    async (columnId: string, rowId: string, asset: EnrichedMediaAssetRef) => {
      const key = `${columnId}:${rowId}`;
      setTable((prev) => {
        if (!prev) return prev;
        const newMap = { ...prev.cellMap };
        const existing = newMap[key];
        const currentAssets = (existing?.mediaAssets as EnrichedMediaAssetRef[]) ?? [];
        newMap[key] = {
          ...(existing ?? {
            id: "",
            tableId,
            columnId,
            rowId,
            textContent: null,
            updatedAt: new Date(),
            updatedBy: currentUserId ?? null,
          }),
          mediaAssets: [...currentAssets, asset],
        } as EnrichedCell;
        return { ...prev, cellMap: newMap };
      });

      sendEvent("pt_media_asset_added", {
        tableId,
        rowId,
        columnId,
        asset,
      });

      try {
        await fetch(`/api/production-table/${tableId}/cells/add-asset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnId, rowId, asset }),
        });
      } catch {
        addToast({ title: t("errors.failedToAddMedia"), color: "danger" });
      }
    },
    [tableId, currentUserId, sendEvent, t]
  );

  const handleMediaAssetRemove = useCallback(
    async (columnId: string, rowId: string, assetId: string) => {
      const key = `${columnId}:${rowId}`;
      setTable((prev) => {
        if (!prev) return prev;
        const newMap = { ...prev.cellMap };
        const existing = newMap[key];
        if (!existing) return prev;
        const currentAssets = (existing.mediaAssets as EnrichedMediaAssetRef[]) ?? [];
        newMap[key] = {
          ...existing,
          mediaAssets: currentAssets.filter((a) => a.assetId !== assetId),
        } as EnrichedCell;
        return { ...prev, cellMap: newMap };
      });

      sendEvent("pt_media_asset_removed", {
        tableId,
        rowId,
        columnId,
        assetId,
      });

      try {
        await fetch(`/api/production-table/${tableId}/cells/remove-asset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnId, rowId, assetId }),
        });
      } catch {
        addToast({ title: t("errors.failedToRemoveMedia"), color: "danger" });
      }
    },
    [tableId, sendEvent, t]
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
      setTable((prev) => {
        if (!prev) return prev;
        const newMap = { ...prev.cellMap };
        newMap[key] = {
          ...(newMap[key] ?? {
            id: "",
            tableId,
            columnId,
            rowId,
            textContent: null,
            mediaAssets: null,
            updatedAt: new Date(),
            updatedBy: currentUserId ?? null,
          }),
          comment: stamped,
        } as EnrichedCell;
        return { ...prev, cellMap: newMap };
      });

      sendEvent("pt_cell_comment_updated", {
        tableId,
        rowId,
        columnId,
        comment: stamped,
      });

      try {
        await fetch(`/api/production-table/${tableId}/cells/comment`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnId, rowId, comment: stamped }),
        });
      } catch {
        addToast({ title: t("errors.failedToSaveComment"), color: "danger" });
      }
    },
    [tableId, currentUserId, user, sendEvent, t]
  );

  const handleRenameColumn = useCallback(
    async (columnId: string, name: string) => {
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
      sendEvent("pt_column_renamed", { tableId, columnId, name });
      try {
        await fetch(
          `/api/production-table/${tableId}/columns/${columnId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          }
        );
      } catch {
        addToast({ title: t("errors.failedToRenameColumn"), color: "danger" });
      }
    },
    [tableId, sendEvent, t]
  );

  const handleDeleteColumn = useCallback(
    async (columnId: string) => {
      setTable((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.filter((c) => c.id !== columnId),
            }
          : prev
      );
      sendEvent("pt_column_removed", { tableId, columnId });
      try {
        await fetch(
          `/api/production-table/${tableId}/columns/${columnId}`,
          { method: "DELETE" }
        );
      } catch {
        addToast({ title: t("errors.failedToDeleteColumn"), color: "danger" });
      }
    },
    [tableId, sendEvent, t]
  );

  const handleDeleteRow = useCallback(
    async (rowId: string) => {
      setTable((prev) =>
        prev
          ? { ...prev, rows: prev.rows.filter((r) => r.id !== rowId) }
          : prev
      );
      sendEvent("pt_row_removed", { tableId, rowId });
      try {
        await fetch(
          `/api/production-table/${tableId}/rows/${rowId}`,
          { method: "DELETE" }
        );
      } catch {
        addToast({ title: t("errors.failedToDeleteRow"), color: "danger" });
      }
    },
    [tableId, sendEvent, t]
  );

  const handleBulkDeleteRows = useCallback(
    async (rowIds: string[]) => {
      setTable((prev) =>
        prev
          ? { ...prev, rows: prev.rows.filter((r) => !rowIds.includes(r.id)) }
          : prev
      );
      for (const rowId of rowIds) {
        sendEvent("pt_row_removed", { tableId, rowId });
        fetch(`/api/production-table/${tableId}/rows/${rowId}`, { method: "DELETE" }).catch(() => {});
      }
    },
    [tableId, sendEvent]
  );

  const handleBulkDeleteColumns = useCallback(
    async (columnIds: string[]) => {
      setTable((prev) =>
        prev
          ? { ...prev, columns: prev.columns.filter((c) => !columnIds.includes(c.id)) }
          : prev
      );
      for (const columnId of columnIds) {
        sendEvent("pt_column_removed", { tableId, columnId });
        fetch(`/api/production-table/${tableId}/columns/${columnId}`, { method: "DELETE" }).catch(() => {});
      }
    },
    [tableId, sendEvent]
  );

  // Column resize
  const handleResizeColumn = useCallback(
    async (columnId: string, width: number) => {
      setTable((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((c) =>
                c.id === columnId ? { ...c, width } : c
              ),
            }
          : prev
      );
      sendEvent("pt_column_resized", { tableId, columnId, width });
      try {
        await fetch(
          `/api/production-table/${tableId}/columns/${columnId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ width }),
          }
        );
      } catch {
        addToast({ title: t("errors.failedToResizeColumn"), color: "danger" });
      }
    },
    [tableId, sendEvent, t]
  );

  // Row resize
  const handleResizeRow = useCallback(
    async (rowId: string, height: number) => {
      setTable((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.id === rowId ? { ...r, height } : r
              ),
            }
          : prev
      );
      sendEvent("pt_row_resized", { tableId, rowId, height });
      try {
        await fetch(
          `/api/production-table/${tableId}/rows/${rowId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ height }),
          }
        );
      } catch {
        addToast({ title: t("errors.failedToResizeRow"), color: "danger" });
      }
    },
    [tableId, sendEvent, t]
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
      const cols = [...table.columns];
      const [moved] = cols.splice(fromIndex, 1);
      cols.splice(toIndex, 0, moved);

      setTable((prev) => (prev ? { ...prev, columns: cols } : prev));

      const newIds = cols.map((c) => c.id);
      sendEvent("pt_columns_reordered", { tableId, columnIds: newIds });

      try {
        await fetch(
          `/api/production-table/${tableId}/columns/reorder`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ columnIds: newIds }),
          }
        );
      } catch {
        addToast({ title: t("errors.failedToReorderColumns"), color: "danger" });
      }
    },
    [table, tableId, sendEvent, t]
  );

  // Row reorder (called by grid after drag-and-drop completes)
  const handleReorderRows = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!table) return;
      const rowsCopy = [...table.rows];
      const [moved] = rowsCopy.splice(fromIndex, 1);
      rowsCopy.splice(toIndex, 0, moved);

      setTable((prev) => (prev ? { ...prev, rows: rowsCopy } : prev));

      const newIds = rowsCopy.map((r) => r.id);
      sendEvent("pt_rows_reordered", { tableId, rowIds: newIds });

      try {
        await fetch(
          `/api/production-table/${tableId}/rows/reorder`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rowIds: newIds }),
          }
        );
      } catch {
        addToast({ title: t("errors.failedToReorderRows"), color: "danger" });
      }
    },
    [table, tableId, sendEvent, t]
  );

  const handleBulkReorderRows = useCallback(
    async (newRowIds: string[]) => {
      if (!table) return;
      const rowMap = new Map(table.rows.map((r) => [r.id, r]));
      const reordered = newRowIds.map((id) => rowMap.get(id)).filter(Boolean) as ProductionTableRow[];
      setTable((prev) => (prev ? { ...prev, rows: reordered } : prev));
      sendEvent("pt_rows_reordered", { tableId, rowIds: newRowIds });
      try {
        await fetch(`/api/production-table/${tableId}/rows/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowIds: newRowIds }),
        });
      } catch {
        addToast({ title: t("errors.failedToReorderRows"), color: "danger" });
      }
    },
    [table, tableId, sendEvent, t]
  );

  const handleBulkReorderColumns = useCallback(
    async (newColumnIds: string[]) => {
      if (!table) return;
      const colMap = new Map(table.columns.map((c) => [c.id, c]));
      const reordered = newColumnIds.map((id) => colMap.get(id)).filter(Boolean) as ProductionTableColumn[];
      setTable((prev) => (prev ? { ...prev, columns: reordered } : prev));
      sendEvent("pt_columns_reordered", { tableId, columnIds: newColumnIds });
      try {
        await fetch(`/api/production-table/${tableId}/columns/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnIds: newColumnIds }),
        });
      } catch {
        addToast({ title: t("errors.failedToReorderColumns"), color: "danger" });
      }
    },
    [table, tableId, sendEvent, t]
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
          onBack={() => router.push("/production-table")}
          onAddColumn={handleAddColumn}
          onAddRow={handleAddRow}
          onShare={shareModal.onOpen}
        />
        <ProductionTableGrid
          columns={table.columns}
          rows={table.rows}
          cellMap={table.cellMap}
          cellLocks={cellLocks}
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
