"use client";

import React, { memo, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import { Modal, ModalContent } from "@heroui/modal";
import { Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { EnrichedMediaAssetRef, CellLock } from "@/lib/production-table/types";
import type { AssetSummary } from "@/components/chat/asset-picker-modal";

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
  lock: CellLock | undefined;
  currentUserId: string | undefined;
  onAddAsset: (asset: EnrichedMediaAssetRef) => void;
  onRemoveAsset: (assetId: string) => void;
}

export const MediaCell = memo(function MediaCell({
  rowId,
  columnId,
  assets,
  canEdit,
  isSelected,
  lock,
  currentUserId,
  onAddAsset,
  onRemoveAsset,
}: MediaCellProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const isLockedByOther =
    lock && lock.userId !== currentUserId && lock.expiresAt > Date.now();
  const lockColor = isLockedByOther && lock ? userIdToColor(lock.userId) : undefined;

  const handleSingleSelect = useCallback(
    (asset: AssetSummary) => {
      const ref: EnrichedMediaAssetRef = {
        assetId: asset.assetId ?? asset.id,
        imageId: asset.imageId,
        assetType: asset.assetType ?? "image",
        imageUrl: asset.imageUrl,
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

  const previewAsset = previewIndex !== null ? assets[previewIndex] : null;

  return (
    <div
      className={`w-full h-full min-h-[32px] p-1 relative ${
        isSelected ? "bg-primary/10 hover:bg-primary/15" : ""
      }`}
      style={lockColor ? { boxShadow: `inset 0 0 0 2px ${lockColor}` } : undefined}
    >
      <div className="flex flex-wrap gap-1">
        {assets.map((asset, idx) => (
          <div key={`${asset.assetId}-${idx}`} className="relative group">
            {asset.imageUrl && (
              <Image
                alt=""
                className="object-cover rounded cursor-pointer"
                height={40}
                width={40}
                src={asset.imageUrl}
                onClick={() => setPreviewIndex(idx)}
              />
            )}
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
        <AssetPickerModal
          isOpen={pickerOpen}
          onOpenChange={() => setPickerOpen(false)}
          onSelect={handleSingleSelect}
          onSelectMultiple={handleMultiSelect}
          onUpload={() => {}}
          multiSelect
        />
      )}

      {/* Media preview lightbox */}
      <Modal
        isOpen={previewIndex !== null}
        onOpenChange={(open) => { if (!open) setPreviewIndex(null); }}
        size="4xl"
        hideCloseButton
        classNames={{
          backdrop: "bg-black/80",
          base: "bg-transparent shadow-none max-h-[90vh]",
          body: "p-0",
        }}
      >
        <ModalContent>
          {() => (
            <div
              className="relative flex items-center justify-center"
              onClick={() => setPreviewIndex(null)}
            >
              {/* Close button */}
              <button
                className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
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
                  {previewAsset.assetType === "video" && previewAsset.videoUrl ? (
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
    </div>
  );
});
