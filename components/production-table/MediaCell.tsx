"use client";

import React, { memo, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import { Plus, X } from "lucide-react";
import type { MediaAssetRef, CellLock } from "@/lib/production-table/types";
import type { AssetSummary } from "@/components/chat/asset-picker-modal";

const AssetPickerModal = dynamic(
  () => import("@/components/chat/asset-picker-modal"),
  { ssr: false }
);

interface MediaCellProps {
  rowId: string;
  columnId: string;
  assets: MediaAssetRef[];
  canEdit: boolean;
  lock: CellLock | undefined;
  currentUserId: string | undefined;
  onCommit: (assets: MediaAssetRef[]) => void;
}

export const MediaCell = memo(function MediaCell({
  rowId,
  columnId,
  assets,
  canEdit,
  lock,
  currentUserId,
  onCommit,
}: MediaCellProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isLockedByOther =
    lock && lock.userId !== currentUserId && lock.expiresAt > Date.now();

  const handleSingleSelect = useCallback(
    (asset: AssetSummary) => {
      const ref: MediaAssetRef = {
        assetId: asset.assetId ?? asset.id,
        imageId: asset.imageId,
        assetType: asset.assetType ?? "image",
        imageUrl: asset.imageUrl,
      };
      onCommit([...assets, ref]);
      setPickerOpen(false);
    },
    [assets, onCommit]
  );

  const handleMultiSelect = useCallback(
    (selected: AssetSummary[]) => {
      const newRefs: MediaAssetRef[] = selected.map((a) => ({
        assetId: a.assetId ?? a.id,
        imageId: a.imageId,
        assetType: a.assetType ?? "image",
        imageUrl: a.imageUrl,
      }));
      onCommit([...assets, ...newRefs]);
      setPickerOpen(false);
    },
    [assets, onCommit]
  );

  const removeAsset = useCallback(
    (index: number) => {
      const next = assets.filter((_, i) => i !== index);
      onCommit(next);
    },
    [assets, onCommit]
  );

  return (
    <div
      className={`w-full h-full min-h-[32px] p-1 relative ${
        isLockedByOther ? "bg-warning-50" : ""
      }`}
    >
      <div className="flex flex-wrap gap-1">
        {assets.map((asset, idx) => (
          <div key={`${asset.imageId}-${idx}`} className="relative group">
            {asset.imageUrl && (
              <Image
                alt=""
                className="object-cover rounded"
                height={40}
                width={40}
                src={asset.imageUrl}
              />
            )}
            {canEdit && !isLockedByOther && (
              <button
                className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeAsset(idx)}
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
        <div className="absolute top-0 right-0 px-1 text-[10px] bg-warning-200 text-warning-800 rounded-bl">
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
    </div>
  );
});
