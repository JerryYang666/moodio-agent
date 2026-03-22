"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { VideoSuggestAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Pencil, Check, X } from "lucide-react";

interface VideoSuggestLock {
  userId: string;
  sessionId: string;
  firstName: string;
}

interface VideoSuggestAssetProps {
  asset: EnrichedDesktopAsset;
  onImageLoad: (assetId: string, naturalWidth: number, naturalHeight: number) => void;
  /** Callback when the user saves edits to the title or videoIdea */
  onContentCommit?: (assetId: string, updates: { title: string; videoIdea: string }) => void;
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
  currentUserId?: string;
  isLockedByOther?: boolean;
  lockInfo?: VideoSuggestLock;
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

export default function VideoSuggestAsset({
  asset,
  onImageLoad,
  onContentCommit,
  sendEvent,
  currentUserId,
  isLockedByOther,
  lockInfo,
}: VideoSuggestAssetProps) {
  const meta = asset.metadata as unknown as VideoSuggestAssetMeta;
  const src = asset.imageUrl;
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(meta.title || "");
  const [editVideoIdea, setEditVideoIdea] = useState(meta.videoIdea || "");
  const lastBroadcast = useRef(0);
  const pendingBroadcast = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from remote updates when not editing
  useEffect(() => {
    if (!isEditing) {
      setEditTitle(meta.title || "");
      setEditVideoIdea(meta.videoIdea || "");
    }
  }, [meta.title, meta.videoIdea, isEditing]);

  // Clean up pending broadcast on unmount
  useEffect(() => {
    return () => {
      if (pendingBroadcast.current) clearTimeout(pendingBroadcast.current);
    };
  }, []);

  // Heartbeat: re-broadcast selection lock while editing
  useEffect(() => {
    if (!isEditing || !sendEvent) return;
    const interval = setInterval(() => {
      sendEvent("text_selected", { assetId: asset.id });
    }, SELECTION_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [isEditing, sendEvent, asset.id]);

  const broadcastTyping = useCallback(
    (title: string, videoIdea: string) => {
      if (!sendEvent) return;
      const now = Date.now();
      const payload = { assetId: asset.id, title, videoIdea };
      if (now - lastBroadcast.current >= TYPING_BROADCAST_MS) {
        lastBroadcast.current = now;
        sendEvent("video_suggest_updated", payload);
      } else {
        if (pendingBroadcast.current) clearTimeout(pendingBroadcast.current);
        pendingBroadcast.current = setTimeout(() => {
          lastBroadcast.current = Date.now();
          sendEvent("video_suggest_updated", payload);
        }, TYPING_BROADCAST_MS);
      }
    },
    [sendEvent, asset.id]
  );

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isLockedByOther) return;
      setEditTitle(meta.title || "");
      setEditVideoIdea(meta.videoIdea || "");
      setIsEditing(true);
      sendEvent?.("text_selected", { assetId: asset.id });
    },
    [meta.title, meta.videoIdea, isLockedByOther, sendEvent, asset.id]
  );

  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(false);
      sendEvent?.("text_deselected", { assetId: asset.id });
      if (onContentCommit) {
        onContentCommit(asset.id, { title: editTitle, videoIdea: editVideoIdea });
        sendEvent?.("video_suggest_updated", { assetId: asset.id, title: editTitle, videoIdea: editVideoIdea });
      }
    },
    [asset.id, editTitle, editVideoIdea, onContentCommit, sendEvent]
  );

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(false);
      sendEvent?.("text_deselected", { assetId: asset.id });
    },
    [sendEvent, asset.id]
  );

  const handleTitleChange = useCallback(
    (value: string) => {
      setEditTitle(value);
      broadcastTyping(value, editVideoIdea);
    },
    [broadcastTyping, editVideoIdea]
  );

  const handleVideoIdeaChange = useCallback(
    (value: string) => {
      setEditVideoIdea(value);
      broadcastTyping(editTitle, value);
    },
    [broadcastTyping, editTitle]
  );

  const isLockedByMe = isEditing;
  const lockHue = lockInfo ? hashToHue(lockInfo.userId) : 0;

  return (
    <div
      className="w-full h-full flex flex-row overflow-hidden bg-background rounded-lg group/vs relative"
      style={
        isLockedByOther
          ? { boxShadow: `inset 0 0 0 2px hsl(${lockHue}, 70%, 60%)` }
          : isLockedByMe
            ? { boxShadow: "inset 0 0 0 2px hsl(var(--heroui-primary))" }
            : undefined
      }
    >
      {/* Lock indicator */}
      {isLockedByOther && lockInfo && (
        <span
          className="absolute -top-3 left-1 text-[9px] px-1 rounded text-white whitespace-nowrap z-10"
          style={{ backgroundColor: `hsl(${lockHue}, 70%, 50%)` }}
        >
          {lockInfo.firstName} is editing
        </span>
      )}

      {/* Thumbnail */}
      <div className="w-[120px] min-w-[120px] h-full relative bg-default-100">
        {src ? (
          <img
            src={src}
            alt={meta.title || "Video idea"}
            draggable={false}
            className="w-full h-full object-cover"
            onLoad={(e) => {
              const img = e.currentTarget;
              onImageLoad(asset.id, img.naturalWidth, img.naturalHeight);
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Spinner size="sm" />
          </div>
        )}
      </div>
      {/* Content */}
      <div className="flex-1 p-2.5 flex flex-col justify-center min-w-0 overflow-hidden">
        {isEditing ? (
          <div
            className="flex flex-col gap-1.5"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Input
              size="sm"
              value={editTitle}
              onValueChange={handleTitleChange}
              variant="bordered"
              classNames={{ input: "text-xs" }}
              placeholder="Title"
            />
            <Textarea
              size="sm"
              value={editVideoIdea}
              onValueChange={handleVideoIdeaChange}
              variant="bordered"
              minRows={1}
              maxRows={3}
              classNames={{ input: "text-[11px]" }}
              placeholder="Video idea"
            />
            <div className="flex gap-1 justify-end">
              <Button isIconOnly size="sm" variant="light" onClick={handleCancel}>
                <X size={12} />
              </Button>
              <Button isIconOnly size="sm" color="primary" onClick={handleSave}>
                <Check size={12} />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-semibold text-xs truncate">{meta.title || ""}</p>
            {meta.videoIdea && (
              <p className="text-[11px] text-default-500 mt-1 line-clamp-3 leading-tight">
                {meta.videoIdea}
              </p>
            )}
          </>
        )}
      </div>
      {/* Edit button */}
      {!isEditing && !isLockedByOther && onContentCommit && (
        <div className="absolute top-1 right-1 opacity-0 group-hover/vs:opacity-100 transition-opacity">
          <Button
            isIconOnly
            size="sm"
            variant="solid"
            className="bg-background/80 backdrop-blur-sm"
            onClick={handleEditClick}
          >
            <Pencil size={12} />
          </Button>
        </div>
      )}
    </div>
  );
}
