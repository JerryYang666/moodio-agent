"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { VideoSuggestAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Modal, ModalContent, ModalBody } from "@heroui/modal";
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

  const handleSave = useCallback(() => {
    setIsEditing(false);
    sendEvent?.("text_deselected", { assetId: asset.id });
    if (onContentCommit) {
      onContentCommit(asset.id, { title: editTitle, videoIdea: editVideoIdea });
      sendEvent?.("video_suggest_updated", { assetId: asset.id, title: editTitle, videoIdea: editVideoIdea });
    }
  }, [asset.id, editTitle, editVideoIdea, onContentCommit, sendEvent]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    sendEvent?.("video_suggest_updated", {
      assetId: asset.id,
      title: meta.title || "",
      videoIdea: meta.videoIdea || "",
    });
    sendEvent?.("text_deselected", { assetId: asset.id });
  }, [sendEvent, asset.id, meta.title, meta.videoIdea]);

  const handleModalClose = useCallback(() => {
    // Treat closing the modal as cancel
    handleCancel();
  }, [handleCancel]);

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
    <>
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
          <p className="font-semibold text-xs truncate">{meta.title || ""}</p>
          {meta.videoIdea && (
            <p className="text-[11px] text-default-500 mt-1 line-clamp-3 leading-tight">
              {meta.videoIdea}
            </p>
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

      <Modal
        isOpen={isEditing}
        onClose={handleModalClose}
        size="5xl"
        scrollBehavior="inside"
        classNames={{
          wrapper: "z-[9999]",
          backdrop: "z-[9998]",
          base: "max-h-[85vh] overflow-hidden",
        }}
        hideCloseButton
      >
        <ModalContent>
          <ModalBody className="p-0 flex flex-row h-[75vh]">
            <div className="flex-1 min-w-0 bg-black flex items-center justify-center">
              {src ? (
                <img
                  src={src}
                  alt={editTitle || "Video idea"}
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
              ) : (
                <Spinner size="lg" color="white" />
              )}
            </div>

            <div className="w-[400px] min-w-[400px] flex flex-col bg-background border-l border-divider">
              <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
                <h3 className="text-lg font-semibold">Edit Video Idea</h3>
                <div className="flex gap-1">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={handleCancel}
                  >
                    <X size={16} />
                  </Button>
                </div>
              </div>

              <div
                className="flex-1 p-5 flex flex-col gap-4 overflow-auto"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Title</label>
                  <Input
                    value={editTitle}
                    onValueChange={handleTitleChange}
                    variant="bordered"
                    placeholder="Title"
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-sm font-medium text-foreground">Video Idea</label>
                  <Textarea
                    value={editVideoIdea}
                    onValueChange={handleVideoIdeaChange}
                    variant="bordered"
                    minRows={6}
                    maxRows={20}
                    placeholder="Describe the video idea..."
                    classNames={{ inputWrapper: "flex-1", input: "h-full" }}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end px-5 py-4 border-t border-divider">
                <Button variant="flat" onPress={handleCancel}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSave} startContent={<Check size={16} />}>
                  Save
                </Button>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
