"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { TextAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";

interface TextLock {
  userId: string;
  sessionId: string;
  firstName: string;
}

export interface TextAssetProps {
  asset: EnrichedDesktopAsset;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  currentUserId?: string;
  isLockedByOther?: boolean;
  lockInfo?: TextLock;
  onTextCommit?: (assetId: string, content: string) => void;
}

const SELECTION_HEARTBEAT_MS = 1000;
const TYPING_BROADCAST_MS = 100;

function hashToHue(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export default function TextAsset({
  asset,
  sendEvent,
  currentUserId,
  isLockedByOther,
  lockInfo,
  onTextCommit,
}: TextAssetProps) {
  const t = useTranslations("desktop");
  const meta = asset.metadata as unknown as TextAssetMeta;

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(meta.content || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastBroadcast = useRef(0);
  const pendingBroadcast = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync editValue with incoming prop changes when not editing
  useEffect(() => {
    if (!isEditing) {
      setEditValue(meta.content || "");
    }
  }, [meta.content, isEditing]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // Cleanup pending broadcast on unmount
  useEffect(() => {
    return () => {
      if (pendingBroadcast.current) clearTimeout(pendingBroadcast.current);
    };
  }, []);

  // Heartbeat: re-broadcast text_selected while editing
  useEffect(() => {
    if (!isEditing || !sendEvent) return;
    const interval = setInterval(() => {
      sendEvent("text_selected", { assetId: asset.id });
    }, SELECTION_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [isEditing, sendEvent, asset.id]);

  const broadcastTyping = useCallback(
    (value: string) => {
      if (!sendEvent) return;
      const now = Date.now();
      if (now - lastBroadcast.current >= TYPING_BROADCAST_MS) {
        lastBroadcast.current = now;
        sendEvent("text_updated", { assetId: asset.id, content: value });
      } else {
        if (pendingBroadcast.current) clearTimeout(pendingBroadcast.current);
        pendingBroadcast.current = setTimeout(() => {
          lastBroadcast.current = Date.now();
          sendEvent("text_updated", { assetId: asset.id, content: value });
        }, TYPING_BROADCAST_MS);
      }
    },
    [sendEvent, asset.id]
  );

  const startEditing = useCallback(() => {
    if (isLockedByOther) return;
    setIsEditing(true);
    setEditValue(meta.content || "");
    sendEvent?.("text_selected", { assetId: asset.id });
  }, [isLockedByOther, meta.content, sendEvent, asset.id]);

  const commitEdit = useCallback(() => {
    if (!isEditing) return;
    setIsEditing(false);
    sendEvent?.("text_deselected", { assetId: asset.id });
    if (editValue !== meta.content) {
      onTextCommit?.(asset.id, editValue);
      sendEvent?.("text_updated", { assetId: asset.id, content: editValue });
    }
  }, [isEditing, editValue, meta.content, sendEvent, asset.id, onTextCommit]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setEditValue(val);
      broadcastTyping(val);
    },
    [broadcastTyping]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        commitEdit();
      }
      // Prevent canvas-level keyboard shortcuts while editing
      e.stopPropagation();
    },
    [commitEdit]
  );

  const isLockedByMe = isEditing;
  const lockHue = lockInfo ? hashToHue(lockInfo.userId) : 0;

  return (
    <div
      className="relative w-full h-full bg-background"
      style={
        isLockedByOther
          ? { boxShadow: `inset 0 0 0 2px hsl(${lockHue}, 70%, 60%)` }
          : isLockedByMe
            ? { boxShadow: "inset 0 0 0 2px hsl(var(--heroui-primary))" }
            : undefined
      }
      onDoubleClick={startEditing}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {isLockedByOther && lockInfo && (
        <span
          className="absolute -top-3 left-1 text-[9px] px-1 rounded text-white whitespace-nowrap z-10"
          style={{ backgroundColor: `hsl(${lockHue}, 70%, 50%)` }}
        >
          {t("editingLockedByUser", { name: lockInfo.firstName })}
        </span>
      )}

      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="w-full h-full p-3 resize-none bg-transparent text-foreground outline-none"
          style={{ fontSize: meta.fontSize || 14, color: meta.color }}
          value={editValue}
          onChange={handleChange}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div
          className="w-full h-full p-3 overflow-auto text-foreground whitespace-pre-wrap cursor-text"
          style={{ fontSize: meta.fontSize || 14, color: meta.color }}
        >
          {meta.content || (
            <span className="text-default-400 italic">
              {t("textAssetPlaceholder")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
