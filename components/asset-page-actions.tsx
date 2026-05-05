"use client";

import { Button } from "@heroui/button";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import {
  Pencil,
  Trash2,
  Share2,
  FolderPlus,
  ImagePlus,
  CheckSquare,
  X,
  Layers,
  MoreHorizontal,
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
  /** Optional: show a "Create element" button next to "New folder" when provided. */
  onCreateElement?: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
  labels: {
    selectItems: string;
    cancelSelection: string;
    uploadImages: string;
    compressing: string;
    newFolder: string;
    newElement?: string;
    rename: string;
    share: string;
    delete: string;
    moreActions?: string;
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
  onCreateElement,
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
      {canWrite && canEdit && (
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
      {canEdit && (
        <Dropdown>
          <DropdownTrigger>
            <Button
              as="div"
              role="button"
              tabIndex={isSelectionMode ? -1 : 0}
              isIconOnly
              variant="flat"
              aria-label={labels.moreActions ?? "More actions"}
              className={`w-full sm:w-auto ${hiddenWhenSelecting}`}
            >
              <MoreHorizontal size={18} />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label={labels.moreActions ?? "More actions"}>
            {canWrite && onCreateElement && labels.newElement ? (
              <DropdownItem
                key="new-element"
                startContent={<Layers size={16} />}
                onPress={onCreateElement}
              >
                {labels.newElement}
              </DropdownItem>
            ) : null}
            <DropdownItem
              key="rename"
              startContent={<Pencil size={16} />}
              onPress={onRename}
            >
              {labels.rename}
            </DropdownItem>
            <DropdownItem
              key="share"
              startContent={<Share2 size={16} />}
              onPress={onShare}
            >
              {labels.share}
            </DropdownItem>
            <DropdownItem
              key="delete"
              startContent={<Trash2 size={16} />}
              color="danger"
              className="text-danger"
              onPress={onDelete}
            >
              {labels.delete}
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      )}
    </div>
  );
}
