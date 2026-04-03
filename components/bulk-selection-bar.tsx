"use client";

import { Button } from "@heroui/button";
import { Copy, Move, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface BulkSelectionBarProps {
  visible: boolean;
  selectedCount: number;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
  onCopy: () => void;
  onMove: () => void;
  onDelete: () => void;
  labels: {
    selectedCount: string;
    selectAll: string;
    deselectAll: string;
    bulkCopyTo: string;
    bulkMoveTo: string;
    bulkDelete: string;
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
  labels,
}: BulkSelectionBarProps) {
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
