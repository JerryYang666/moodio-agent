"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ArrowLeft } from "lucide-react";
import { useDisclosure } from "@heroui/modal";
import { useAuth } from "@/hooks/use-auth";
import {
  useProductionTableWS,
  type RemoteEvent,
} from "@/hooks/use-production-table-ws";
import { ProductionTableGrid } from "@/components/production-table/ProductionTableGrid";
import { ProductionTableToolbar } from "@/components/production-table/ProductionTableToolbar";
import { ProductionTableShareModal } from "@/components/production-table/ProductionTableShareModal";
import { hasWriteAccess, isOwner as isOwnerCheck } from "@/lib/permissions";
import type {
  EnrichedProductionTable,
  ProductionTableColumn,
  ProductionTableRow,
  EnrichedCell,
  CellType,
  MediaAssetRef,
} from "@/lib/production-table/types";

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

  const draggedColumnRef = useRef<string | null>(null);
  const draggedRowRef = useRef<string | null>(null);

  // Fetch table data
  const fetchTable = useCallback(async () => {
    try {
      const res = await fetch(`/api/production-table/${tableId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTable(data.table);
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
      if (!table) return;

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
    [table, tableId]
  );

  const {
    connectionState,
    sendEvent,
    connectedUsers,
    cellLocks,
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

  const handleCellCommit = useCallback(
    async (
      columnId: string,
      rowId: string,
      textContent?: string | null,
      mediaAssets?: MediaAssetRef[] | null
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

  // Drag-and-drop column reordering
  const handleColumnDragStart = useCallback(
    (e: React.DragEvent, columnId: string) => {
      draggedColumnRef.current = columnId;
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleColumnDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleColumnDrop = useCallback(
    async (e: React.DragEvent, targetColumnId: string) => {
      e.preventDefault();
      const draggedId = draggedColumnRef.current;
      if (!draggedId || draggedId === targetColumnId || !table) return;
      draggedColumnRef.current = null;

      const cols = [...table.columns];
      const fromIdx = cols.findIndex((c) => c.id === draggedId);
      const toIdx = cols.findIndex((c) => c.id === targetColumnId);
      if (fromIdx === -1 || toIdx === -1) return;

      const [moved] = cols.splice(fromIdx, 1);
      cols.splice(toIdx, 0, moved);

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

  // Drag-and-drop row reordering
  const handleRowDragStart = useCallback(
    (e: React.DragEvent, rowId: string) => {
      draggedRowRef.current = rowId;
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleRowDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleRowDrop = useCallback(
    async (e: React.DragEvent, targetRowId: string) => {
      e.preventDefault();
      const draggedId = draggedRowRef.current;
      if (!draggedId || draggedId === targetRowId || !table) return;
      draggedRowRef.current = null;

      const rowsCopy = [...table.rows];
      const fromIdx = rowsCopy.findIndex((r) => r.id === draggedId);
      const toIdx = rowsCopy.findIndex((r) => r.id === targetRowId);
      if (fromIdx === -1 || toIdx === -1) return;

      const [moved] = rowsCopy.splice(fromIdx, 1);
      rowsCopy.splice(toIdx, 0, moved);

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
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-default-200">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          aria-label="Back"
          onPress={() => router.push("/production-table")}
        >
          <ArrowLeft size={16} />
        </Button>
      </div>
      <ProductionTableToolbar
        tableName={table.name}
        connectionState={connectionState}
        connectedUsers={connectedUsers}
        canEdit={canEditStructure}
        onAddColumn={handleAddColumn}
        onAddRow={handleAddRow}
        onShare={shareModal.onOpen}
      />
      <ProductionTableGrid
        columns={table.columns}
        rows={table.rows}
        cellMap={table.cellMap}
        cellLocks={cellLocks}
        currentUserId={currentUserId}
        canEditCell={canEditCell}
        canEditStructure={canEditStructure}
        sendEvent={sendEvent}
        onCellCommit={handleCellCommit}
        onRenameColumn={handleRenameColumn}
        onDeleteColumn={handleDeleteColumn}
        onDeleteRow={() => {}}
        onColumnDragStart={handleColumnDragStart}
        onColumnDragOver={handleColumnDragOver}
        onColumnDrop={handleColumnDrop}
        onRowDragStart={handleRowDragStart}
        onRowDragOver={handleRowDragOver}
        onRowDrop={handleRowDrop}
      />
      <ProductionTableShareModal
        isOpen={shareModal.isOpen}
        onClose={shareModal.onClose}
        tableId={tableId}
        columns={table.columns}
        rows={table.rows}
        isOwner={isTableOwner}
      />
    </div>
  );
}
