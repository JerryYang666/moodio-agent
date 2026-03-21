"use client";

import { useState, useCallback } from "react";
import type { VideoSuggestAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Pencil, Check, X } from "lucide-react";

interface VideoSuggestAssetProps {
  asset: EnrichedDesktopAsset;
  onImageLoad: (assetId: string, naturalWidth: number, naturalHeight: number) => void;
  /** Callback when the user saves edits to the title or videoIdea */
  onContentCommit?: (assetId: string, updates: { title: string; videoIdea: string }) => void;
}

export default function VideoSuggestAsset({
  asset,
  onImageLoad,
  onContentCommit,
}: VideoSuggestAssetProps) {
  const meta = asset.metadata as unknown as VideoSuggestAssetMeta;
  const src = asset.imageUrl;
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(meta.title || "");
  const [editVideoIdea, setEditVideoIdea] = useState(meta.videoIdea || "");

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setEditTitle(meta.title || "");
      setEditVideoIdea(meta.videoIdea || "");
      setIsEditing(true);
    },
    [meta.title, meta.videoIdea]
  );

  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(false);
      if (onContentCommit) {
        onContentCommit(asset.id, { title: editTitle, videoIdea: editVideoIdea });
      }
    },
    [asset.id, editTitle, editVideoIdea, onContentCommit]
  );

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(false);
    },
    []
  );

  return (
    <div className="w-full h-full flex flex-row overflow-hidden bg-background rounded-lg group/vs">
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
              onValueChange={setEditTitle}
              variant="bordered"
              classNames={{ input: "text-xs" }}
              placeholder="Title"
            />
            <Textarea
              size="sm"
              value={editVideoIdea}
              onValueChange={setEditVideoIdea}
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
      {!isEditing && onContentCommit && (
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
