"use client";

import { Button } from "@heroui/button";
import {
  Pencil,
  Trash2,
  Share2,
  FolderPlus,
  ImagePlus,
  CheckSquare,
  X,
} from "lucide-react";

export interface AssetPageActionsProps {
  hasAssets: boolean;
  canWrite: boolean;
  canEdit: boolean;
  isSelectionMode: boolean;
  isUploading: boolean;
  isCompressing: boolean;
  onToggleSelection: () => void;
  onUpload: () => void;
  onCreateFolder: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
  labels: {
    selectItems: string;
    cancelSelection: string;
    uploadImages: string;
    compressing: string;
    newFolder: string;
    rename: string;
    share: string;
    delete: string;
  };
}

export default function AssetPageActions({
  hasAssets,
  canWrite,
  canEdit,
  isSelectionMode,
  isUploading,
  isCompressing,
  onToggleSelection,
  onUpload,
  onCreateFolder,
  onRename,
  onShare,
  onDelete,
  labels,
}: AssetPageActionsProps) {
  const hiddenWhenSelecting = isSelectionMode ? "invisible pointer-events-none" : "";

  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
      {canWrite && hasAssets && (
        <Button
          variant={isSelectionMode ? "solid" : "flat"}
          color={isSelectionMode ? "primary" : "default"}
          startContent={isSelectionMode ? <X size={18} /> : <CheckSquare size={18} />}
          onPress={onToggleSelection}
          className="w-full sm:w-auto"
        >
          {isSelectionMode ? labels.cancelSelection : labels.selectItems}
        </Button>
      )}
      {canWrite && (
        <Button
          color="primary"
          variant="flat"
          startContent={isUploading ? undefined : <ImagePlus size={18} />}
          onPress={onUpload}
          isLoading={isUploading}
          className={`w-full sm:w-auto ${hiddenWhenSelecting}`}
          tabIndex={isSelectionMode ? -1 : undefined}
        >
          {isCompressing ? labels.compressing : labels.uploadImages}
        </Button>
      )}
      {canEdit && (
        <>
          <Button
            variant="flat"
            startContent={<Pencil size={18} />}
            onPress={onRename}
            className={`w-full sm:w-auto ${hiddenWhenSelecting}`}
            tabIndex={isSelectionMode ? -1 : undefined}
          >
            {labels.rename}
          </Button>
          <Button
            variant="flat"
            startContent={<Share2 size={18} />}
            onPress={onShare}
            className={`w-full sm:w-auto ${hiddenWhenSelecting}`}
            tabIndex={isSelectionMode ? -1 : undefined}
          >
            {labels.share}
          </Button>
          {canWrite && (
            <Button
              variant="flat"
              startContent={<FolderPlus size={18} />}
              onPress={onCreateFolder}
              className={`w-full sm:w-auto ${hiddenWhenSelecting}`}
              tabIndex={isSelectionMode ? -1 : undefined}
            >
              {labels.newFolder}
            </Button>
          )}
          <Button
            color="danger"
            variant="flat"
            startContent={<Trash2 size={18} />}
            onPress={onDelete}
            className={`w-full sm:w-auto ${hiddenWhenSelecting}`}
            tabIndex={isSelectionMode ? -1 : undefined}
          >
            {labels.delete}
          </Button>
        </>
      )}
    </div>
  );
}
