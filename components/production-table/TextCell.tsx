"use client";

import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import type { CellLock } from "@/lib/production-table/types";

const SELECTION_HEARTBEAT_MS = 1000;

interface TextCellProps {
  rowId: string;
  columnId: string;
  value: string;
  canEdit: boolean;
  lock: CellLock | undefined;
  currentUserId: string | undefined;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  onCommit: (value: string) => void;
}

export const TextCell = memo(function TextCell({
  rowId,
  columnId,
  value,
  canEdit,
  lock,
  currentUserId,
  sendEvent,
  onCommit,
}: TextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isLockedByOther =
    lock && lock.userId !== currentUserId && lock.expiresAt > Date.now();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Re-broadcast cell_selected every second while editing
  useEffect(() => {
    if (!editing || !sendEvent) return;
    sendEvent("pt_cell_selected", { rowId, columnId });
    const interval = setInterval(() => {
      sendEvent("pt_cell_selected", { rowId, columnId });
    }, SELECTION_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [editing, sendEvent, rowId, columnId]);

  const startEditing = useCallback(() => {
    if (!canEdit || isLockedByOther) return;
    setEditing(true);
    setDraft(value);
  }, [canEdit, isLockedByOther, value]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    sendEvent?.("pt_cell_deselected", { rowId, columnId });
    if (draft !== value) {
      onCommit(draft);
    }
  }, [draft, value, onCommit, sendEvent, rowId, columnId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(value);
        setEditing(false);
        sendEvent?.("pt_cell_deselected", { rowId, columnId });
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitEdit();
      }
    },
    [value, commitEdit, sendEvent, rowId, columnId]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setDraft(newValue);
      sendEvent?.("pt_cell_updated", {
        rowId,
        columnId,
        textContent: newValue,
      });
    },
    [sendEvent, rowId, columnId]
  );

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        className="w-full h-full min-h-[32px] p-1.5 text-sm bg-background border-2 border-primary rounded resize-none outline-none"
        value={draft}
        onChange={handleChange}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div
      className={`w-full h-full min-h-[32px] p-1.5 text-sm truncate cursor-default relative ${
        canEdit && !isLockedByOther
          ? "hover:bg-default-100 cursor-text"
          : ""
      } ${isLockedByOther ? "bg-warning-50" : ""}`}
      onDoubleClick={startEditing}
    >
      {value || <span className="text-default-300">&nbsp;</span>}
      {isLockedByOther && lock && (
        <div className="absolute top-0 right-0 px-1 text-[10px] bg-warning-200 text-warning-800 rounded-bl">
          {lock.userName}
        </div>
      )}
    </div>
  );
});
