"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@heroui/spinner";
import { Clapperboard, SendHorizontal, Check } from "lucide-react";
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
  onCellCommit?: (assetId: string, rowId: string, colIndex: number, value: string) => void;
}

function cellKey(rowId: string, colIndex: number) {
  return `${rowId}-${colIndex}`;
}

const TYPING_BROADCAST_INTERVAL_MS = 100;
const SELECTION_HEARTBEAT_MS = 1000;

export default function TableAsset({ asset, sendEvent, cellLocks, currentUserId, onCellCommit }: TableAssetProps) {
  const t = useTranslations("desktop");
  const meta = asset.metadata as unknown as TableAssetMeta;
  const isStreaming = meta.status === "streaming";

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [localCellOverride, setLocalCellOverride] = useState<{ key: string; value: string } | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const lastBroadcast = useRef(0);
  const pendingBroadcast = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  // Cleanup pending broadcast on unmount
  useEffect(() => {
    return () => {
      if (pendingBroadcast.current) clearTimeout(pendingBroadcast.current);
    };
  }, []);

  // Clear localCellOverride once the canonical prop has updated (whether it
  // caught up to the same value or diverged due to a remote edit). The
  // override only needs to survive the single render between commit and the
  // state propagation; after that, cell.value is the source of truth.
  useEffect(() => {
    if (!localCellOverride) return;
    if (editingCell === localCellOverride.key) return;
    setLocalCellOverride(null);
  }, [meta.rows, localCellOverride, editingCell]);

  // Re-broadcast cell_selected every second so newcomers see the lock
  useEffect(() => {
    if (!editingCell || !sendEvent) return;
    const dashIdx = editingCell.lastIndexOf("-");
    const rowId = editingCell.substring(0, dashIdx);
    const colIndex = parseInt(editingCell.substring(dashIdx + 1), 10);

    const interval = setInterval(() => {
      sendEvent("cell_selected", { assetId: asset.id, rowId, colIndex });
    }, SELECTION_HEARTBEAT_MS);

    return () => clearInterval(interval);
  }, [editingCell, sendEvent, asset.id]);

  const handleCellClick = useCallback(
    (rowId: string, colIndex: number, e: React.MouseEvent) => {
      e.stopPropagation();
      if (isStreaming) return;

      const key = cellKey(rowId, colIndex);
      const lock = cellLocks?.get(key);
      if (lock && lock.userId !== currentUserId) return;

      if (editingCell === key) return;

      // Commit previous cell first
      if (editingCell) {
        commitEditForCell(editingCell);
      }

      const row = meta.rows.find((r) => r.id === rowId);
      const cellValue = row?.cells[colIndex]?.value ?? "";

      setEditingCell(key);
      setEditValue(cellValue);
      setLocalCellOverride(null);
      sendEvent?.("cell_selected", { assetId: asset.id, rowId, colIndex });
    },
    [isStreaming, editingCell, cellLocks, currentUserId, sendEvent, asset.id, meta.rows] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const commitEditForCell = useCallback(
    (cellKeyStr: string, value?: string) => {
      // Flush any pending typing broadcast
      if (pendingBroadcast.current) {
        clearTimeout(pendingBroadcast.current);
        pendingBroadcast.current = null;
      }

      const dashIdx = cellKeyStr.lastIndexOf("-");
      const rowId = cellKeyStr.substring(0, dashIdx);
      const colIndex = parseInt(cellKeyStr.substring(dashIdx + 1), 10);
      const finalValue = value ?? editValue;

      const row = meta.rows.find((r) => r.id === rowId);
      const oldValue = row?.cells[colIndex]?.value ?? "";

      if (finalValue !== oldValue) {
        fetch(`/api/desktop/${asset.desktopId}/assets/${asset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cellPatch: { rowId, colIndex, value: finalValue } }),
        }).catch((e) => console.error("Failed to patch cell:", e));

        sendEvent?.("cell_updated", { assetId: asset.id, rowId, colIndex, value: finalValue });
        onCellCommit?.(asset.id, rowId, colIndex, finalValue);
      }

      sendEvent?.("cell_deselected", { assetId: asset.id, rowId, colIndex });
      setLocalCellOverride({ key: cellKeyStr, value: finalValue });
    },
    [editValue, meta.rows, asset.id, asset.desktopId, sendEvent, onCellCommit]
  );

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    commitEditForCell(editingCell);
    setEditingCell(null);
  }, [editingCell, commitEditForCell]);

  const broadcastTyping = useCallback(
    (rowId: string, colIndex: number, value: string) => {
      const now = Date.now();
      const send = () => {
        sendEvent?.("cell_updated", { assetId: asset.id, rowId, colIndex, value });
        lastBroadcast.current = Date.now();
      };

      if (pendingBroadcast.current) {
        clearTimeout(pendingBroadcast.current);
        pendingBroadcast.current = null;
      }

      if (now - lastBroadcast.current >= TYPING_BROADCAST_INTERVAL_MS) {
        send();
      } else {
        pendingBroadcast.current = setTimeout(send, TYPING_BROADCAST_INTERVAL_MS);
      }
    },
    [sendEvent, asset.id]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setEditValue(newValue);

      if (editingCell) {
        const dashIdx = editingCell.lastIndexOf("-");
        const rowId = editingCell.substring(0, dashIdx);
        const colIndex = parseInt(editingCell.substring(dashIdx + 1), 10);
        broadcastTyping(rowId, colIndex, newValue);
      }
    },
    [editingCell, broadcastTyping]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        commitEdit();
      } else if (e.key === "Escape") {
        if (pendingBroadcast.current) {
          clearTimeout(pendingBroadcast.current);
          pendingBroadcast.current = null;
        }
        if (editingCell) {
          const dashIdx = editingCell.lastIndexOf("-");
          const rowId = editingCell.substring(0, dashIdx);
          const colIndex = parseInt(editingCell.substring(dashIdx + 1), 10);
          sendEvent?.("cell_deselected", { assetId: asset.id, rowId, colIndex });
        }
        setEditingCell(null);
        setLocalCellOverride(null);
      }
    },
    [commitEdit, editingCell, sendEvent, asset.id]
  );

  const toggleRowSelection = useCallback(
    (rowId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(rowId)) {
          next.delete(rowId);
        } else {
          next.add(rowId);
        }
        return next;
      });
    },
    []
  );

  const toggleAllRows = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedRowIds((prev) =>
        prev.size === meta.rows.length ? new Set() : new Set(meta.rows.map((r) => r.id))
      );
    },
    [meta.rows]
  );

  const handleSendSelectedToChat = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (selectedRowIds.size === 0) return;

      const selectedRows = meta.rows.filter((r) => selectedRowIds.has(r.id));
      const lines = selectedRows.map((row) =>
        meta.columns.map((col, ci) => `${col}: ${row.cells[ci]?.value ?? ""}`).join(" | ")
      );
      const text = `[${meta.title || t("shotList")}]\n${lines.join("\n")}`;

      window.dispatchEvent(
        new CustomEvent("moodio-batch-to-chat", {
          detail: { text },
        })
      );
      setSelectedRowIds(new Set());
    },
    [selectedRowIds, meta, t]
  );

  if (isStreaming) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-background p-4">
        <Clapperboard size={24} className="text-secondary/60" />
        <Spinner size="sm" />
        <span className="text-xs text-default-400">{t("generatingShotList")}</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-background">
      {/* Title bar -- does NOT stopPropagation so canvas drag still works */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-background border-b border-divider">
        <Clapperboard size={14} className="text-secondary shrink-0" />
        <span className="text-xs font-semibold text-default-700 truncate">
          {meta.title || t("shotList")}
        </span>
        <span className="text-[10px] text-default-400 ml-auto shrink-0">
          {selectedRowIds.size > 0
            ? t("rowsSelected", { count: selectedRowIds.size })
            : t("shotCount", { count: meta.rows.length })}
        </span>
        {selectedRowIds.size > 0 && (
          <button
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity shrink-0"
            onClick={handleSendSelectedToChat}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SendHorizontal size={10} />
            {t("sendRowsToChat")}
          </button>
        )}
      </div>

      {/* Table -- stopPropagation only on the table so cell clicks don't trigger canvas drag */}
      <table
        className="w-full text-[11px] border-collapse"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <thead>
          <tr>
            <th
              className="w-7 px-1 py-1.5 text-center bg-default-50 border-b border-r border-divider sticky top-[33px] z-5"
              onClick={toggleAllRows}
            >
              <div
                className={`w-3.5 h-3.5 mx-auto rounded-sm border cursor-pointer flex items-center justify-center transition-colors ${
                  selectedRowIds.size === meta.rows.length && meta.rows.length > 0
                    ? "bg-primary border-primary"
                    : selectedRowIds.size > 0
                      ? "bg-primary/40 border-primary"
                      : "border-default-300 hover:border-default-400"
                }`}
              >
                {selectedRowIds.size > 0 && (
                  <Check size={10} className="text-primary-foreground" strokeWidth={3} />
                )}
              </div>
            </th>
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
          {meta.rows.map((row) => {
            const isRowSelected = selectedRowIds.has(row.id);
            return (
            <tr key={row.id} className={isRowSelected ? "bg-primary/5" : "hover:bg-default-50/50"}>
              <td
                className="w-7 px-1 py-1.5 text-center border-b border-r border-divider cursor-pointer"
                onClick={(e) => toggleRowSelection(row.id, e)}
              >
                <div
                  className={`w-3.5 h-3.5 mx-auto rounded-sm border flex items-center justify-center transition-colors ${
                    isRowSelected
                      ? "bg-primary border-primary"
                      : "border-default-300 hover:border-default-400"
                  }`}
                >
                  {isRowSelected && (
                    <Check size={10} className="text-primary-foreground" strokeWidth={3} />
                  )}
                </div>
              </td>
              {row.cells.map((cell, ci) => {
                const key = cellKey(row.id, ci);
                const isEditing = editingCell === key;
                const lock = cellLocks?.get(key);
                const isLockedByOther = lock && lock.userId !== currentUserId;
                const isLockedByMe = lock && lock.userId === currentUserId;

                // Show local override if we just committed this cell
                const displayValue =
                  localCellOverride?.key === key
                    ? localCellOverride.value
                    : cell.value;

                return (
                  <td
                    key={ci}
                    className="relative px-2 py-1.5 border-b border-r border-divider cursor-text"
                    style={
                      isLockedByOther
                        ? { boxShadow: `inset 0 0 0 2px hsl(${hashToHue(lock.userId)}, 70%, 60%)` }
                        : isEditing || isLockedByMe
                          ? { boxShadow: "inset 0 0 0 2px hsl(var(--heroui-primary))" }
                          : undefined
                    }
                    onClick={(e) => handleCellClick(row.id, ci, e)}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        className="w-full bg-transparent outline-none text-[11px] text-foreground"
                        value={editValue}
                        onChange={handleInputChange}
                        onBlur={commitEdit}
                        onKeyDown={handleKeyDown}
                      />
                    ) : (
                      <span className="text-default-700 whitespace-pre-wrap wrap-break-word">
                        {displayValue}
                      </span>
                    )}
                    {isLockedByOther && (
                      <span
                        className="absolute -top-3 left-1 text-[9px] px-1 rounded text-white whitespace-nowrap"
                        style={{ backgroundColor: `hsl(${hashToHue(lock.userId)}, 70%, 50%)` }}
                      >
                        {lock.firstName}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
            );
          })}
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
