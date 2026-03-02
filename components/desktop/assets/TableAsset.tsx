"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Spinner } from "@heroui/spinner";
import { Clapperboard } from "lucide-react";
import type { TableAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";

interface CellLock {
  userId: string;
  sessionId: string;
  firstName: string;
}

interface TableAssetProps {
  asset: EnrichedDesktopAsset;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  cellLocks?: Map<string, CellLock>;
  currentUserId?: string;
}

function cellKey(rowId: string, colIndex: number) {
  return `${rowId}-${colIndex}`;
}

export default function TableAsset({ asset, sendEvent, cellLocks, currentUserId }: TableAssetProps) {
  const meta = asset.metadata as unknown as TableAssetMeta;
  const isStreaming = meta.status === "streaming";

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  const handleCellClick = useCallback(
    (rowId: string, colIndex: number) => {
      if (isStreaming) return;

      const key = cellKey(rowId, colIndex);
      const lock = cellLocks?.get(key);
      if (lock && lock.userId !== currentUserId) return;

      if (editingCell === key) return;

      // Deselect previous cell
      if (editingCell) {
        const [prevRowId, prevColStr] = editingCell.split("-");
        const prevCol = parseInt(prevColStr, 10);
        sendEvent?.("cell_deselected", { assetId: asset.id, rowId: prevRowId, colIndex: prevCol });
      }

      const row = meta.rows.find((r) => r.id === rowId);
      const cellValue = row?.cells[colIndex]?.value ?? "";

      setEditingCell(key);
      setEditValue(cellValue);
      sendEvent?.("cell_selected", { assetId: asset.id, rowId, colIndex });
    },
    [isStreaming, editingCell, cellLocks, currentUserId, sendEvent, asset.id, meta.rows]
  );

  const commitEdit = useCallback(() => {
    if (!editingCell) return;

    const [rowId, colStr] = editingCell.split("-");
    const colIndex = parseInt(colStr, 10);

    const row = meta.rows.find((r) => r.id === rowId);
    const oldValue = row?.cells[colIndex]?.value ?? "";

    if (editValue !== oldValue) {
      // Persist via cell patch API
      fetch(`/api/desktop/${asset.desktopId}/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cellPatch: { rowId, colIndex, value: editValue } }),
      }).catch((e) => console.error("Failed to patch cell:", e));

      sendEvent?.("cell_updated", { assetId: asset.id, rowId, colIndex, value: editValue });
    }

    sendEvent?.("cell_deselected", { assetId: asset.id, rowId, colIndex });
    setEditingCell(null);
  }, [editingCell, editValue, meta.rows, asset.id, asset.desktopId, sendEvent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        commitEdit();
      } else if (e.key === "Escape") {
        if (editingCell) {
          const [rowId, colStr] = editingCell.split("-");
          const colIndex = parseInt(colStr, 10);
          sendEvent?.("cell_deselected", { assetId: asset.id, rowId, colIndex });
        }
        setEditingCell(null);
      }
    },
    [commitEdit, editingCell, sendEvent, asset.id]
  );

  if (isStreaming) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-background p-4">
        <Clapperboard size={24} className="text-secondary/60" />
        <Spinner size="sm" />
        <span className="text-xs text-default-400">Generating shot list...</span>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full overflow-auto bg-background"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Title bar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-secondary/5 border-b border-divider">
        <Clapperboard size={14} className="text-secondary shrink-0" />
        <span className="text-xs font-semibold text-default-700 truncate">
          {meta.title || "Shot List"}
        </span>
        <span className="text-[10px] text-default-400 ml-auto shrink-0">
          {meta.rows.length} shots
        </span>
      </div>

      {/* Table */}
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr>
            {meta.columns.map((col, i) => (
              <th
                key={i}
                className="px-2 py-1.5 text-left font-semibold text-default-600 bg-default-50 border-b border-r border-divider whitespace-nowrap sticky top-[33px] z-5"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meta.rows.map((row) => (
            <tr key={row.id} className="hover:bg-default-50/50">
              {row.cells.map((cell, ci) => {
                const key = cellKey(row.id, ci);
                const isEditing = editingCell === key;
                const lock = cellLocks?.get(key);
                const isLockedByOther = lock && lock.userId !== currentUserId;

                return (
                  <td
                    key={ci}
                    className="relative px-2 py-1.5 border-b border-r border-divider cursor-text"
                    style={
                      isLockedByOther
                        ? { boxShadow: `inset 0 0 0 2px hsl(${hashToHue(lock.userId)}, 70%, 60%)` }
                        : isEditing
                          ? { boxShadow: "inset 0 0 0 2px hsl(var(--heroui-primary))" }
                          : undefined
                    }
                    onClick={() => handleCellClick(row.id, ci)}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        className="w-full bg-transparent outline-none text-[11px] text-foreground"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={handleKeyDown}
                      />
                    ) : (
                      <span className="text-default-700 whitespace-pre-wrap wrap-break-word">
                        {cell.value}
                      </span>
                    )}
                    {isLockedByOther && (
                      <span className="absolute -top-3 left-1 text-[9px] px-1 rounded bg-default-200 text-default-600 whitespace-nowrap">
                        {lock.firstName}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function hashToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}
