"use client";

import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import type { CellLock } from "@/lib/production-table/types";

const SELECTION_HEARTBEAT_MS = 1000;

function userIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

interface TextCellProps {
  rowId: string;
  columnId: string;
  value: string;
  canEdit: boolean;
  isSelected?: boolean;
  shouldActivate?: boolean;
  onActivated?: () => void;
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
  isSelected,
  shouldActivate,
  onActivated,
  lock,
  currentUserId,
  sendEvent,
  onCommit,
}: TextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendEventRef = useRef(sendEvent);
  sendEventRef.current = sendEvent;

  const isLockedByOther =
    lock && lock.userId !== currentUserId && lock.expiresAt > Date.now();
  const lockColor = isLockedByOther && lock ? userIdToColor(lock.userId) : undefined;

  // Sync prop into draft only when NOT editing (desktop TextAsset pattern)
  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  // Heartbeat: re-broadcast cell_selected every second while editing
  useEffect(() => {
    if (!editing) return;
    sendEventRef.current?.("pt_cell_selected", { rowId, columnId });
    const interval = setInterval(() => {
      sendEventRef.current?.("pt_cell_selected", { rowId, columnId });
    }, SELECTION_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [editing, rowId, columnId]);

  const startEditing = useCallback(() => {
    if (!canEdit || isLockedByOther) return;
    setEditing(true);
    setDraft(value);
  }, [canEdit, isLockedByOther, value]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    sendEventRef.current?.("pt_cell_deselected", { rowId, columnId });
    if (draft !== value) {
      onCommit(draft);
    }
  }, [draft, value, onCommit, rowId, columnId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(value);
        setEditing(false);
        sendEventRef.current?.("pt_cell_deselected", { rowId, columnId });
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitEdit();
      }
    },
    [value, commitEdit, rowId, columnId]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setDraft(newValue);
      sendEventRef.current?.("pt_cell_updated", {
        rowId,
        columnId,
        textContent: newValue,
      });
    },
    [rowId, columnId]
  );

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  // Enter key activation from parent grid
  const startEditingRef = useRef(startEditing);
  startEditingRef.current = startEditing;
  const onActivatedRef = useRef(onActivated);
  onActivatedRef.current = onActivated;
  useEffect(() => {
    if (!shouldActivate) return;
    startEditingRef.current();
    onActivatedRef.current?.();
  }, [shouldActivate]);

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
      className={`w-full h-full min-h-[32px] p-1.5 text-sm wrap-break-word overflow-hidden cursor-default relative ${
        isSelected
          ? "bg-primary/10 hover:bg-primary/15 cursor-text"
          : canEdit && !isLockedByOther
            ? "hover:bg-default-100 cursor-text"
            : ""
      }`}
      style={lockColor ? { boxShadow: `inset 0 0 0 2px ${lockColor}` } : undefined}
      onDoubleClick={startEditing}
    >
      {value || <span className="text-default-300">&nbsp;</span>}
      {isLockedByOther && lock && (
        <div
          className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] text-white rounded-t whitespace-nowrap pointer-events-none z-10"
          style={{ backgroundColor: lockColor }}
        >
          {lock.userName}
        </div>
      )}
    </div>
  );
});
