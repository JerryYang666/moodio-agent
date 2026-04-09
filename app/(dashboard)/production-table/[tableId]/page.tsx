"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import type {
  EnrichedProductionTable,
  ProductionTableColumn,
  ProductionTableRow,
  EnrichedCell,
  CellType,
  CellComment,
  EnrichedMediaAssetRef,
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
      addToast({ title: "Failed to load table", color: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tableId]);

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
      try {
        const res = await fetch(
          `/api/production-table/${tableId}/columns`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: `Column ${(table?.columns.length ?? 0) + 1}`, cellType }),
          }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setTable((prev) =>
          prev ? { ...prev, columns: [...prev.columns, data.column] } : prev
        );
        sendEvent("pt_column_added", { tableId, column: data.column });
      } catch {
        addToast({ title: "Failed to add column", color: "danger" });
      }
    },
    [tableId, table?.columns.length, sendEvent]
  );

  const handleAddRow = useCallback(async () => {
    try {
      const res = await fetch(`/api/production-table/${tableId}/rows`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTable((prev) =>
        prev ? { ...prev, rows: [...prev.rows, data.row] } : prev
      );
      sendEvent("pt_row_added", { tableId, row: data.row });
    } catch {
      addToast({ title: "Failed to add row", color: "danger" });
    }
  }, [tableId, sendEvent]);

  const handleInsertRow = useCallback(
    async (anchorRowId: string, position: "above" | "below") => {
      if (!table) return;
      try {
        const res = await fetch(`/api/production-table/${tableId}/rows`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
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
      } catch {
        addToast({ title: "Failed to insert row", color: "danger" });
      }
    },
    [table, tableId, sendEvent]
  );

  const handleInsertColumn = useCallback(
    async (anchorColumnId: string, position: "left" | "right", cellType: CellType) => {
      if (!table) return;
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
        if (!res.ok) throw new Error();
        const data = await res.json();
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
      } catch {
        addToast({ title: "Failed to insert column", color: "danger" });
      }
    },
    [table, tableId, sendEvent]
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
        addToast({ title: "Failed to save cell", color: "danger" });
      }
    },
    [tableId, currentUserId, sendEvent]
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
        addToast({ title: "Failed to add media", color: "danger" });
      }
    },
    [tableId, currentUserId, sendEvent]
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
        addToast({ title: "Failed to remove media", color: "danger" });
      }
    },
    [tableId, sendEvent]
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
        addToast({ title: "Failed to save comment", color: "danger" });
      }
    },
    [tableId, currentUserId, user, sendEvent]
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
        addToast({ title: "Failed to rename column", color: "danger" });
      }
    },
    [tableId, sendEvent]
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
        addToast({ title: "Failed to delete column", color: "danger" });
      }
    },
    [tableId, sendEvent]
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
        addToast({ title: "Failed to delete row", color: "danger" });
      }
    },
    [tableId, sendEvent]
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
        addToast({ title: "Failed to resize column", color: "danger" });
      }
    },
    [tableId, sendEvent]
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
        addToast({ title: "Failed to resize row", color: "danger" });
      }
    },
    [tableId, sendEvent]
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
        addToast({ title: "Failed to reorder columns", color: "danger" });
      }
    },
    [table, tableId, sendEvent]
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
        addToast({ title: "Failed to reorder rows", color: "danger" });
      }
    },
    [table, tableId, sendEvent]
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
        addToast({ title: "Failed to reorder rows", color: "danger" });
      }
    },
    [table, tableId, sendEvent]
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
        addToast({ title: "Failed to reorder columns", color: "danger" });
      }
    },
    [table, tableId, sendEvent]
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
        <p className="text-default-500">Table not found or access denied.</p>
        <Button variant="flat" onPress={() => router.push("/production-table")}>
          Back to tables
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
