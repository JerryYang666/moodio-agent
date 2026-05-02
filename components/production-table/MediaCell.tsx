"use client";

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { Input } from "@heroui/input";
import { addToast } from "@heroui/toast";
import { Plus, X, ChevronLeft, ChevronRight, Download, Music, Loader2, FolderPlus, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { hasWriteAccess } from "@/lib/permissions";
import { useCollections } from "@/hooks/use-collections";
import AudioPlayer from "@/components/audio-player";
import type { EnrichedMediaAssetRef, CellLock } from "@/lib/production-table/types";
import type { AssetSummary } from "@/components/chat/asset-picker-modal";
import { AI_IMAGE_DRAG_MIME, AI_VIDEO_DRAG_MIME, AI_VIDEO_SUGGEST_DRAG_MIME, AI_AUDIO_DRAG_MIME, AI_GROUP_DRAG_MIME } from "@/components/chat/asset-dnd";
import GroupDetailDrawer from "@/components/production-table/GroupDetailDrawer";
import { uploadImage } from "@/lib/upload/client";
import { uploadAudio } from "@/lib/upload/audio-client";
import { uploadVideo } from "@/lib/upload/video-client";
import { siteConfig } from "@/config/site";
import ImageDownloadDropdown from "@/components/chat/image-download-dropdown";

const AssetPickerModal = dynamic(
  () => import("@/components/chat/asset-picker-modal"),
  { ssr: false }
);

function userIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

interface MediaCellProps {
  rowId: string;
  columnId: string;
  assets: EnrichedMediaAssetRef[];
  canEdit: boolean;
  isSelected?: boolean;
  isUploading?: boolean;
  shouldActivate?: boolean;
  onActivated?: () => void;
  lock: CellLock | undefined;
  currentUserId: string | undefined;
  onAddAsset: (asset: EnrichedMediaAssetRef) => void;
  onRemoveAsset: (assetId: string) => void;
  /** Label used as asset title when adding to a collection (e.g. "Column · Row 3") */
  assetLabel?: string;
}

export const MediaCell = memo(function MediaCell({
  rowId,
  columnId,
  assets,
  canEdit,
  isSelected,
  isUploading,
  shouldActivate,
  onActivated,
  lock,
  currentUserId,
  onAddAsset,
  onRemoveAsset,
  assetLabel,
}: MediaCellProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const isLockedByOther =
    lock && lock.userId !== currentUserId && lock.expiresAt > Date.now();
  const lockColor = isLockedByOther && lock ? userIdToColor(lock.userId) : undefined;

  // Enter key activation from parent grid — open picker (same as clicking Add)
  const onActivatedRef = useRef(onActivated);
  onActivatedRef.current = onActivated;
  useEffect(() => {
    if (!shouldActivate || !canEdit || isLockedByOther) return;
    setPickerOpen(true);
    onActivatedRef.current?.();
  }, [shouldActivate, canEdit, isLockedByOther]);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit || isLockedByOther) return;
      const types = e.dataTransfer.types;
      if (
        types.includes(AI_IMAGE_DRAG_MIME) ||
        types.includes(AI_VIDEO_DRAG_MIME) ||
        types.includes(AI_VIDEO_SUGGEST_DRAG_MIME) ||
        types.includes(AI_AUDIO_DRAG_MIME) ||
        types.includes(AI_GROUP_DRAG_MIME)
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      }
    },
    [canEdit, isLockedByOther]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(false);
      if (!canEdit || isLockedByOther) return;

      const types = e.dataTransfer.types;
      const hasAssetDrag =
        types.includes(AI_IMAGE_DRAG_MIME) ||
        types.includes(AI_VIDEO_DRAG_MIME) ||
        types.includes(AI_VIDEO_SUGGEST_DRAG_MIME) ||
        types.includes(AI_AUDIO_DRAG_MIME) ||
        types.includes(AI_GROUP_DRAG_MIME);
      if (!hasAssetDrag) return;

      e.preventDefault();
      e.stopPropagation();

      const imageData = e.dataTransfer.getData(AI_IMAGE_DRAG_MIME);
      const videoData = e.dataTransfer.getData(AI_VIDEO_DRAG_MIME);
      const videoSuggestData = e.dataTransfer.getData(AI_VIDEO_SUGGEST_DRAG_MIME);
      const audioData = e.dataTransfer.getData(AI_AUDIO_DRAG_MIME);
      const groupData = e.dataTransfer.getData(AI_GROUP_DRAG_MIME);

      if (groupData) {
        try {
          const parsed = JSON.parse(groupData);
          if (!parsed.folderId) return;
          const ref: EnrichedMediaAssetRef = {
            assetId: parsed.folderId,
            imageId: parsed.coverImageId || parsed.folderId,
            assetType: "group",
            folderId: parsed.folderId,
            groupModality: parsed.modality,
            groupMemberCount: parsed.memberCount,
            groupName: parsed.name,
          };
          onAddAsset(ref);
        } catch { /* ignore malformed data */ }
        return;
      }

      if (imageData) {
        try {
          const parsed = JSON.parse(imageData);
          if (!parsed.imageId) return;
          const ref: EnrichedMediaAssetRef = {
            assetId: parsed.imageId,
            imageId: parsed.imageId,
            assetType: "image",
            imageUrl: parsed.url || undefined,
          };
          onAddAsset(ref);
        } catch { /* ignore malformed data */ }
        return;
      }

      if (videoSuggestData) {
        try {
          const parsed = JSON.parse(videoSuggestData);
          if (!parsed.imageId) return;
          const ref: EnrichedMediaAssetRef = {
            assetId: parsed.imageId,
            imageId: parsed.imageId,
            assetType: "image",
            imageUrl: parsed.url || undefined,
          };
          onAddAsset(ref);
        } catch { /* ignore malformed data */ }
        return;
      }

      if (videoData) {
        try {
          const parsed = JSON.parse(videoData);
          if (!parsed.videoId || !parsed.thumbnailImageId) return;
          const ref: EnrichedMediaAssetRef = {
            assetId: parsed.videoId,
            imageId: parsed.thumbnailImageId,
            assetType: "video",
            imageUrl: parsed.thumbnailUrl || undefined,
            videoUrl: parsed.videoUrl || undefined,
          };
          onAddAsset(ref);
        } catch { /* ignore malformed data */ }
        return;
      }

      if (audioData) {
        try {
          const parsed = JSON.parse(audioData);
          if (!parsed.audioId) return;
          const ref: EnrichedMediaAssetRef = {
            assetId: parsed.audioId,
            imageId: "audio-file-placeholder",
            assetType: "audio",
            audioUrl: parsed.audioUrl || undefined,
          };
          onAddAsset(ref);
        } catch { /* ignore malformed data */ }
        return;
      }
    },
    [canEdit, isLockedByOther, onAddAsset]
  );

  const handleSingleSelect = useCallback(
    (asset: AssetSummary) => {
      const ref: EnrichedMediaAssetRef = {
        assetId: asset.assetId ?? asset.id,
        imageId: asset.imageId,
        assetType: asset.assetType ?? "image",
        imageUrl: asset.imageUrl,
        videoUrl: asset.videoUrl,
        audioUrl: asset.audioUrl,
        thumbnailSmUrl: asset.thumbnailSmUrl,
        thumbnailMdUrl: asset.thumbnailMdUrl,
      };
      onAddAsset(ref);
      setPickerOpen(false);
    },
    [onAddAsset]
  );

  const handleMultiSelect = useCallback(
    (selected: AssetSummary[]) => {
      for (const a of selected) {
        onAddAsset({
          assetId: a.assetId ?? a.id,
          imageId: a.imageId,
          assetType: a.assetType ?? "image",
          imageUrl: a.imageUrl,
          videoUrl: a.videoUrl,
          audioUrl: a.audioUrl,
          thumbnailSmUrl: a.thumbnailSmUrl,
          thumbnailMdUrl: a.thumbnailMdUrl,
        });
      }
      setPickerOpen(false);
    },
    [onAddAsset]
  );

  const handleRemove = useCallback(
    (assetId: string) => {
      onRemoveAsset(assetId);
    },
    [onRemoveAsset]
  );

  const [isFileUploading, setIsFileUploading] = useState(false);

  const handleFileUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setIsFileUploading(true);
      let remaining = files.length;

      const done = () => {
        remaining--;
        if (remaining <= 0) setIsFileUploading(false);
      };

      const allowedImageTypes = siteConfig.upload.allowedImageTypes;
      const allowedAudioTypes = siteConfig.upload.allowedAudioTypes;
      const allowedVideoTypes = siteConfig.upload.allowedVideoTypes;

      for (const file of files) {
        if (allowedImageTypes.includes(file.type)) {
          uploadImage(file).then((outcome) => {
            if (outcome.success) {
              onAddAsset({
                assetId: outcome.data.imageId,
                imageId: outcome.data.imageId,
                assetType: "image",
                imageUrl: outcome.data.imageUrl,
              });
            }
            done();
          });
        } else if (allowedAudioTypes.includes(file.type)) {
          uploadAudio(file).then((outcome) => {
            if (outcome.success) {
              onAddAsset({
                assetId: outcome.data.audioId,
                imageId: "audio-file-placeholder",
                assetType: "audio",
                audioUrl: outcome.data.audioUrl,
              });
            }
            done();
          });
        } else if (allowedVideoTypes.includes(file.type)) {
          uploadVideo(file).then((outcome) => {
            if (outcome.success) {
              onAddAsset({
                assetId: outcome.data.videoId,
                imageId: outcome.data.thumbnailImageId || outcome.data.videoId,
                assetType: "video",
                videoUrl: outcome.data.videoUrl,
              });
            }
            done();
          });
        } else {
          done();
        }
      }
    },
    [onAddAsset]
  );

  const previewAsset = previewIndex !== null ? assets[previewIndex] : null;

  // Group drawer state — opened when a group cell is clicked.
  const [groupDrawerAsset, setGroupDrawerAsset] =
    useState<EnrichedMediaAssetRef | null>(null);
  const closeGroupDrawer = useCallback(() => setGroupDrawerAsset(null), []);

  // ── Collection menu state ──
  const tMenu = useTranslations("imageMenu");
  const tCollections = useTranslations("collections");
  const tCommon = useTranslations("common");
  const {
    collections,
    createCollection,
    addImageToCollection,
    addVideoToCollection,
    addAudioToCollection,
    getDefaultCollectionName,
  } = useCollections();

  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onOpenChange: onCreateOpenChange,
  } = useDisclosure();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [assetContextMenu, setAssetContextMenu] = useState<{
    asset: EnrichedMediaAssetRef;
    x: number;
    y: number;
  } | null>(null);

  const pendingCollectionAssetRef = useRef<EnrichedMediaAssetRef | null>(null);

  const handleAssetContextMenu = useCallback(
    (asset: EnrichedMediaAssetRef, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setAssetContextMenu({ asset, x: e.clientX, y: e.clientY });
    },
    []
  );

  const closeAssetContextMenu = useCallback(() => {
    setAssetContextMenu(null);
  }, []);

  const addAssetToCollection = useCallback(
    async (collectionId: string, asset: EnrichedMediaAssetRef) => {
      const details = { title: assetLabel || "", prompt: "", status: "generated" as const };
      if (asset.assetType === "video") {
        await addVideoToCollection(collectionId, asset.imageId, asset.assetId, details);
      } else if (asset.assetType === "audio") {
        await addAudioToCollection(collectionId, asset.assetId, details);
      } else {
        await addImageToCollection(collectionId, asset.imageId, null, details);
      }
      closeAssetContextMenu();
    },
    [assetLabel, addImageToCollection, addVideoToCollection, addAudioToCollection, closeAssetContextMenu]
  );

  const handleCreateNewCollection = useCallback(
    (asset: EnrichedMediaAssetRef) => {
      pendingCollectionAssetRef.current = asset;
      setNewCollectionName(getDefaultCollectionName());
      closeAssetContextMenu();
      onCreateOpen();
    },
    [getDefaultCollectionName, onCreateOpen, closeAssetContextMenu]
  );

  const handleCreateAndAdd = useCallback(async () => {
    if (!newCollectionName.trim() || !pendingCollectionAssetRef.current) return;
    setIsCreating(true);
    try {
      const collection = await createCollection(newCollectionName.trim());
      if (collection) {
        await addAssetToCollection(collection.id, pendingCollectionAssetRef.current);
        setNewCollectionName("");
        onCreateOpenChange();
      }
    } catch (error: any) {
      const msg = error?.status === 409 ? tCollections("duplicateName") : tCollections("createFailed");
      addToast({ title: tCollections("error"), description: msg, color: "danger" });
    } finally {
      setIsCreating(false);
      pendingCollectionAssetRef.current = null;
    }
  }, [newCollectionName, createCollection, addAssetToCollection, onCreateOpenChange, tCollections]);

  const handleDownload = useCallback(async () => {
    if (!previewAsset) return;
    const isVideo =
      (previewAsset.assetType === "video" ||
        previewAsset.assetType === "public_video") &&
      !!previewAsset.videoUrl;
    const isAudioAsset = previewAsset.assetType === "audio" && !!previewAsset.audioUrl;
    const prefix = isAudioAsset ? "audio" : isVideo ? "video" : "image";
    const filename = `${prefix}-${previewAsset.assetId}`;
    const downloadUrl = isAudioAsset
      ? `/api/audio/${encodeURIComponent(previewAsset.assetId)}/download?filename=${encodeURIComponent(filename)}`
      : isVideo
        ? `/api/video/${encodeURIComponent(previewAsset.assetId)}/download?filename=${encodeURIComponent(filename)}`
        : `/api/image/${encodeURIComponent(previewAsset.imageId)}/download?filename=${encodeURIComponent(filename)}`;

    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      // Let the Content-Disposition header from the backend set the
      // filename; pass an empty string so the browser honors it.
      a.download = "";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download error:", e);
    }
  }, [previewAsset]);

  return (
    <div
      className={`w-full h-full min-h-[32px] p-1 relative transition-colors ${
        isDragOver
          ? "bg-primary/20 ring-2 ring-inset ring-primary"
          : isSelected
            ? "bg-primary/10 hover:bg-primary/15"
            : ""
      }`}
      style={lockColor ? { boxShadow: `inset 0 0 0 2px ${lockColor}` } : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-wrap gap-1">
        {assets.map((asset, idx) => (
          <div key={`${asset.assetId}-${idx}`} className="relative group">
            {asset.assetType === "group" ? (
              <button
                className="relative w-10 h-10 rounded bg-default-100 border border-divider overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary"
                onClick={() => setGroupDrawerAsset(asset)}
                title={`${asset.groupName ?? "Group"} (×${asset.groupMemberCount ?? "?"})`}
              >
                {asset.imageUrl ? (
                  <img
                    src={asset.imageUrl}
                    alt=""
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <Layers size={14} className="text-default-500" />
                )}
                <span className="absolute bottom-0 right-0 px-1 py-0.5 text-[9px] bg-black/60 text-white font-mono rounded-tl">
                  ×{asset.groupMemberCount ?? "?"}
                </span>
                {/* Stack-of-cards motif */}
                <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 w-full h-full border-r border-b border-divider/60 rounded" />
              </button>
            ) : asset.assetType === "audio" ? (
              <div
                className="w-10 h-10 rounded bg-violet-500/20 flex items-center justify-center cursor-pointer"
                onClick={() => setPreviewIndex(idx)}
                onContextMenu={(e) => handleAssetContextMenu(asset, e)}
              >
                <Music size={16} className="text-violet-400" />
              </div>
            ) : asset.imageUrl ? (
              <div onContextMenu={(e) => handleAssetContextMenu(asset, e)}>
                <Image
                  alt=""
                  className="object-cover rounded cursor-pointer"
                  height={40}
                  width={40}
                  src={
                    asset.assetType === "image" && asset.thumbnailSmUrl
                      ? asset.thumbnailSmUrl
                      : asset.imageUrl
                  }
                  onError={
                    ((e: React.SyntheticEvent<HTMLImageElement>) => {
                      const target = e.currentTarget;
                      if (asset.imageUrl && target.src !== asset.imageUrl) {
                        target.src = asset.imageUrl;
                      }
                    }) as unknown as () => void
                  }
                  onClick={() => setPreviewIndex(idx)}
                />
              </div>
            ) : asset.videoUrl ? (
              <video
                className="object-cover rounded cursor-pointer w-10 h-10"
                src={asset.videoUrl}
                muted
                onClick={() => setPreviewIndex(idx)}
                onContextMenu={(e) => handleAssetContextMenu(asset, e)}
              />
            ) : null}
            {canEdit && !isLockedByOther && (
              <button
                className="absolute -top-1 -right-1 z-10 w-4 h-4 bg-danger text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(asset.assetId);
                }}
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        {(isUploading || isFileUploading) && (
          <div className="w-10 h-10 rounded bg-default-100 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin text-default-400" />
          </div>
        )}
        {canEdit && !isLockedByOther && (
          <Button
            isIconOnly
            size="sm"
            variant="flat"
            aria-label="Add media"
            className="w-10 h-10"
            onPress={() => setPickerOpen(true)}
          >
            <Plus size={14} />
          </Button>
        )}
      </div>
      {isLockedByOther && lock && (
        <div
          className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] text-white rounded-t whitespace-nowrap pointer-events-none z-10"
          style={{ backgroundColor: lockColor }}
        >
          {lock.userName}
        </div>
      )}
      {pickerOpen && (
        <div
          onContextMenu={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <AssetPickerModal
            isOpen={pickerOpen}
            onOpenChange={() => setPickerOpen(false)}
            onSelect={handleSingleSelect}
            onSelectMultiple={handleMultiSelect}
            onUpload={handleFileUpload}
            multiSelect
            acceptTypes={["image", "video", "audio"]}
          />
        </div>
      )}

      {/* Media preview lightbox */}
      <Modal
        isOpen={previewIndex !== null}
        onOpenChange={(open) => { if (!open) setPreviewIndex(null); }}
        size="4xl"
        hideCloseButton
        classNames={{
          wrapper: "z-[70]",
          backdrop: "bg-black/80 z-[70]",
          base: "bg-transparent shadow-none max-h-[90vh]",
          body: "p-0",
        }}
      >
        <ModalContent>
          {() => (
            <div
              className="relative flex items-center justify-center"
              onClick={() => setPreviewIndex(null)}
              // HeroUI's Modal is a React child of this MediaCell, so React
              // synthetic events still bubble through the React tree up to
              // the table cell's handlers even though the modal is portaled
              // out of the cell in the DOM. Stop propagation here so clicks
              // and right-clicks inside the lightbox don't select cells or
              // open the production table's cell context menu. We don't
              // preventDefault on contextmenu so users can still use the
              // browser's native right-click menu to save/copy the media.
              onContextMenu={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Add to Collection button */}
              <button
                className="absolute top-2 right-22 z-20 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                aria-label={tMenu("addToCollection")}
                onClick={(e) => {
                  e.stopPropagation();
                  if (previewAsset) {
                    handleAssetContextMenu(previewAsset, e);
                  }
                }}
              >
                <FolderPlus size={16} />
              </button>

              {/* Download button — image previews get a format-picker dropdown (PNG/JPEG/WebP), video keeps the plain download */}
              {previewAsset &&
              previewAsset.assetType !== "audio" &&
              previewAsset.assetType !== "video" &&
              previewAsset.assetType !== "public_video" &&
              previewAsset.imageUrl &&
              previewAsset.imageId ? (
                <div
                  className="absolute top-2 right-12 z-20"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ImageDownloadDropdown
                    imageId={previewAsset.imageId}
                    title={`image-${previewAsset.assetId}`}
                    url={previewAsset.imageUrl}
                    iconSize={16}
                    className="bg-black/50 text-white rounded-full min-w-8 w-8 h-8 hover:bg-black/70"
                    downloadSource="detail_view"
                  />
                </div>
              ) : (
                <button
                  className="absolute top-2 right-12 z-20 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                  aria-label="Download"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload();
                  }}
                >
                  <Download size={16} />
                </button>
              )}

              {/* Close button */}
              <button
                className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                aria-label="Close"
                onClick={() => setPreviewIndex(null)}
              >
                <X size={18} />
              </button>

              {/* Previous */}
              {assets.length > 1 && previewIndex !== null && previewIndex > 0 && (
                <button
                  className="absolute left-2 z-20 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewIndex((prev) => (prev !== null ? prev - 1 : null));
                  }}
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              {/* Next */}
              {assets.length > 1 && previewIndex !== null && previewIndex < assets.length - 1 && (
                <button
                  className="absolute right-2 z-20 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewIndex((prev) => (prev !== null ? prev + 1 : null));
                  }}
                >
                  <ChevronRight size={22} />
                </button>
              )}

              {/* Media content */}
              {previewAsset && (
                <div
                  className="flex items-center justify-center max-h-[85vh]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {previewAsset.assetType === "audio" && previewAsset.audioUrl ? (
                    <div
                      className="w-full max-w-md p-4"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <AudioPlayer
                        src={previewAsset.audioUrl}
                        variant="full"
                        autoPlay
                        onDownload={handleDownload}
                      />
                    </div>
                  ) : (previewAsset.assetType === "video" || previewAsset.assetType === "public_video") && previewAsset.videoUrl ? (
                    <video
                      src={previewAsset.videoUrl}
                      controls
                      autoPlay
                      className="max-w-full max-h-[85vh] rounded-lg"
                    />
                  ) : previewAsset.imageUrl ? (
                    <img
                      src={previewAsset.imageUrl}
                      alt=""
                      className="max-w-full max-h-[85vh] rounded-lg object-contain"
                    />
                  ) : null}
                </div>
              )}

              {/* Counter */}
              {assets.length > 1 && previewIndex !== null && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 text-white text-xs">
                  {previewIndex + 1} / {assets.length}
                </div>
              )}
            </div>
          )}
        </ModalContent>
      </Modal>

      {/* Asset right-click context menu — portaled to body to escape table stacking context */}
      {assetContextMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-9998"
            onClick={closeAssetContextMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeAssetContextMenu();
            }}
          />
          <div
            className="fixed z-9999 min-w-[200px] py-1 rounded-lg shadow-lg border border-default-200 bg-content1 max-h-[320px] overflow-y-auto"
            style={{ left: assetContextMenu.x, top: assetContextMenu.y }}
            onContextMenu={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs text-default-400 font-semibold uppercase">
              {tMenu("addToCollection")}
            </div>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm font-semibold hover:bg-default-100 transition-colors"
              onClick={() => handleCreateNewCollection(assetContextMenu.asset)}
            >
              <Plus size={14} />
              {tCollections("createNewCollection")}
            </button>
            <div className="my-1 border-t border-default-200" />
            {collections.filter((c) => hasWriteAccess(c.permission)).length === 0 ? (
              <div className="px-3 py-1.5 text-xs text-default-400">
                {tCollections("noCollectionsYet")}
              </div>
            ) : (
              collections
                .filter((c) => hasWriteAccess(c.permission))
                .map((collection) => (
                  <button
                    key={collection.id}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-default-100 transition-colors"
                    onClick={() => addAssetToCollection(collection.id, assetContextMenu.asset)}
                  >
                    <FolderPlus size={14} />
                    {collection.name}
                  </button>
                ))
            )}
          </div>
        </>,
        document.body
      )}

      {/* Group detail drawer */}
      {groupDrawerAsset && groupDrawerAsset.folderId && (
        <GroupDetailDrawer
          isOpen={!!groupDrawerAsset}
          onClose={closeGroupDrawer}
          folderId={groupDrawerAsset.folderId}
          modality={groupDrawerAsset.groupModality ?? "image"}
          canEdit={canEdit}
        />
      )}

      {/* Create Collection Modal */}
      <Modal isOpen={isCreateOpen} onOpenChange={onCreateOpenChange} classNames={{ wrapper: "z-[10000]" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{tCollections("createNewCollection")}</ModalHeader>
              <ModalBody>
                <Input
                  label={tCollections("collectionName")}
                  placeholder={tCollections("enterCollectionName")}
                  value={newCollectionName}
                  onValueChange={setNewCollectionName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateAndAdd();
                  }}
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleCreateAndAdd}
                  isLoading={isCreating}
                  isDisabled={!newCollectionName.trim()}
                >
                  {tMenu("createAndAdd")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
});
