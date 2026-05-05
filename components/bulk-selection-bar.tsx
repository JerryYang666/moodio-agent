"use client";

import { Button } from "@heroui/button";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { ChevronDown, Copy, Download, Move, Trash2 } from "lucide-react";
import { Spinner } from "@heroui/spinner";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Item shown in the bulk-download format dropdown. The `key` is round-tripped
 * back to the consumer through `onDownload(key)`. Use the literal string
 * `"original"` for the no-conversion option; other keys are interpreted by
 * the caller (typically `ImageDownloadFormat` values).
 */
export interface BulkDownloadFormatOption {
  key: string;
  label: string;
}

export interface BulkSelectionBarProps {
  visible: boolean;
  selectedCount: number;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
  onCopy: () => void;
  onMove: () => void;
  onDelete: () => void;
  /**
   * Called when the user triggers a download. When `downloadFormats` is
   * provided, `formatKey` is the `key` of the chosen option; otherwise it
   * is undefined.
   */
  onDownload?: (formatKey?: string) => void;
  isDownloading?: boolean;
  /**
   * When provided, the download button becomes a dropdown trigger and the
   * user picks a format before the download fires. Pass undefined (or omit)
   * to keep the original single-click behaviour.
   */
  downloadFormats?: BulkDownloadFormatOption[];
  labels: {
    selectedCount: string;
    selectAll: string;
    deselectAll: string;
    bulkCopyTo: string;
    bulkMoveTo: string;
    bulkDelete: string;
    bulkDownload?: string;
    /** ARIA label for the format dropdown menu. */
    bulkDownloadFormatLabel?: string;
  };
}

export default function BulkSelectionBar({
  visible,
  selectedCount,
  isAllSelected,
  onToggleSelectAll,
  onCopy,
  onMove,
  onDelete,
  onDownload,
  isDownloading,
  downloadFormats,
  labels,
}: BulkSelectionBarProps) {
  const downloadButton =
    onDownload && labels.bulkDownload
      ? downloadFormats && downloadFormats.length > 0
        ? (
          <Dropdown>
            <DropdownTrigger>
              <Button
                size="sm"
                variant="flat"
                startContent={
                  isDownloading ? <Spinner size="sm" /> : <Download size={14} />
                }
                endContent={!isDownloading && <ChevronDown size={12} />}
                isDisabled={isDownloading}
              >
                {labels.bulkDownload}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label={
                labels.bulkDownloadFormatLabel ?? labels.bulkDownload
              }
              onAction={(key) => onDownload(String(key))}
            >
              {downloadFormats.map((option) => (
                <DropdownItem key={option.key}>{option.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        )
        : (
          <Button
            size="sm"
            variant="flat"
            startContent={
              isDownloading ? <Spinner size="sm" /> : <Download size={14} />
            }
            onPress={() => onDownload()}
            isDisabled={isDownloading}
          >
            {labels.bulkDownload}
          </Button>
        )
      : null;

  return (
    <AnimatePresence>
      {visible && selectedCount > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-background/95 backdrop-blur-md border border-divider shadow-lg">
            <span className="text-sm font-medium whitespace-nowrap mr-1">
              {labels.selectedCount}
            </span>
            <Button
              size="sm"
              variant="flat"
              onPress={onToggleSelectAll}
            >
              {isAllSelected ? labels.deselectAll : labels.selectAll}
            </Button>
            <div className="w-px h-5 bg-divider mx-1" />
            {downloadButton}
            <Button
              size="sm"
              variant="flat"
              startContent={<Copy size={14} />}
              onPress={onCopy}
            >
              {labels.bulkCopyTo}
            </Button>
            <Button
              size="sm"
              variant="flat"
              startContent={<Move size={14} />}
              onPress={onMove}
            >
              {labels.bulkMoveTo}
            </Button>
            <Button
              size="sm"
              variant="flat"
              color="danger"
              startContent={<Trash2 size={14} />}
              onPress={onDelete}
            >
              {labels.bulkDelete}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
