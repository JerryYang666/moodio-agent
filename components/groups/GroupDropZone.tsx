"use client";

import { useCallback, useState } from "react";
import { addToast } from "@heroui/toast";
import {
  AI_IMAGE_DRAG_MIME,
  AI_VIDEO_DRAG_MIME,
  AI_VIDEO_SUGGEST_DRAG_MIME,
} from "@/components/chat/asset-dnd";

export interface GroupDropPayload {
  /** collection_images.id when the dropped asset is an existing collection asset. */
  collectionImageId?: string;
  imageId: string;
  assetId: string;
  assetType: "image" | "video" | "public_image" | "public_video";
  thumbnailImageId?: string;
}

interface GroupDropZoneProps {
  modality: "image" | "video";
  canEdit: boolean;
  onDrop: (payload: GroupDropPayload) => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wrap a child element in a drop target that only accepts the matching
 * modality. Mismatches show a toast instead of being added.
 *
 * Drag payloads come from chat asset chips and follow the existing
 * AI_IMAGE_DRAG_MIME / AI_VIDEO_DRAG_MIME contracts.
 */
export default function GroupDropZone({
  modality,
  canEdit,
  onDrop,
  className,
  children,
}: GroupDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit) return;
      const t = e.dataTransfer.types;
      if (
        t.includes(AI_IMAGE_DRAG_MIME) ||
        t.includes(AI_VIDEO_DRAG_MIME) ||
        t.includes(AI_VIDEO_SUGGEST_DRAG_MIME)
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      }
    },
    [canEdit]
  );

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(false);
      if (!canEdit) return;
      const t = e.dataTransfer.types;
      if (
        !t.includes(AI_IMAGE_DRAG_MIME) &&
        !t.includes(AI_VIDEO_DRAG_MIME) &&
        !t.includes(AI_VIDEO_SUGGEST_DRAG_MIME)
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const imageData = e.dataTransfer.getData(AI_IMAGE_DRAG_MIME);
      const videoData = e.dataTransfer.getData(AI_VIDEO_DRAG_MIME);
      const videoSuggestData = e.dataTransfer.getData(
        AI_VIDEO_SUGGEST_DRAG_MIME
      );

      if (imageData || videoSuggestData) {
        if (modality !== "image") {
          addToast({
            title: "Wrong modality",
            description: "This is a video group — only video assets can be added",
            color: "warning",
          });
          return;
        }
        try {
          const parsed = JSON.parse(imageData || videoSuggestData);
          if (!parsed.imageId) return;
          onDrop({
            imageId: parsed.imageId,
            assetId: parsed.imageId,
            assetType: "image",
            collectionImageId: parsed.collectionImageId,
          });
        } catch {
          /* ignore malformed payload */
        }
        return;
      }

      if (videoData) {
        if (modality !== "video") {
          addToast({
            title: "Wrong modality",
            description: "This is an image group — only image assets can be added",
            color: "warning",
          });
          return;
        }
        try {
          const parsed = JSON.parse(videoData);
          if (!parsed.videoId) return;
          onDrop({
            imageId: parsed.thumbnailImageId || parsed.videoId,
            assetId: parsed.videoId,
            assetType: "video",
            thumbnailImageId: parsed.thumbnailImageId,
            collectionImageId: parsed.collectionImageId,
          });
        } catch {
          /* ignore malformed payload */
        }
      }
    },
    [canEdit, modality, onDrop]
  );

  return (
    <div
      className={`${className ?? ""} ${
        isDragOver ? "ring-2 ring-primary ring-inset bg-primary/10" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
    </div>
  );
}
