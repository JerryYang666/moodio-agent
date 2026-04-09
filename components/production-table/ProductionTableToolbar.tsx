"use client";

import React, { memo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { ArrowLeft, Columns, Rows3, Share2, Wifi, WifiOff } from "lucide-react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Input } from "@heroui/input";
import { PresenceAvatars, type PresenceUser } from "@/components/PresenceAvatars";
import type { ConnectionState } from "@/hooks/use-production-table-ws";
import type { CellType } from "@/lib/production-table/types";
import { MAX_PRODUCTION_TABLE_ROWS, MAX_PRODUCTION_TABLE_COLUMNS } from "@/lib/production-table/types";

interface ProductionTableToolbarProps {
  tableName: string;
  connectionState: ConnectionState;
  connectedUsers: PresenceUser[];
  canEdit: boolean;
  canAddColumns?: boolean;
  canAddRows?: boolean;
  currentRowCount?: number;
  currentColumnCount?: number;
  onBack: () => void;
  onAddColumn: (cellType: CellType, count: number) => void;
  onAddRow: (count: number) => void;
  onShare: () => void;
}

export const ProductionTableToolbar = memo(function ProductionTableToolbar({
  tableName,
  connectionState,
  connectedUsers,
  canEdit,
  canAddColumns = true,
  canAddRows = true,
  currentRowCount = 0,
  currentColumnCount = 0,
  onBack,
  onAddColumn,
  onAddRow,
  onShare,
}: ProductionTableToolbarProps) {
  const t = useTranslations("productionTable");
  const tCommon = useTranslations("common");
  const isConnected = connectionState === "connected";

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchType, setBatchType] = useState<"row" | "column">("row");
  const [pendingCellType, setPendingCellType] = useState<CellType>("text");
  const [batchCount, setBatchCount] = useState("1");

  const openRowModal = () => {
    setBatchType("row");
    setBatchCount("1");
    setBatchModalOpen(true);
  };

  const handleColumnTypeSelect = (cellType: CellType) => {
    setBatchType("column");
    setPendingCellType(cellType);
    setBatchCount("1");
    setBatchModalOpen(true);
  };

  const maxAdditional =
    batchType === "row"
      ? MAX_PRODUCTION_TABLE_ROWS - currentRowCount
      : MAX_PRODUCTION_TABLE_COLUMNS - currentColumnCount;

  const handleBatchConfirm = () => {
    const parsed = parseInt(batchCount, 10);
    const count = Math.max(1, Math.min(99, isNaN(parsed) ? 1 : parsed));
    if (batchType === "row") {
      onAddRow(count);
    } else {
      onAddColumn(pendingCellType, count);
    }
    setBatchModalOpen(false);
  };

  const handleCountChange = (value: string) => {
    // Allow only digits
    if (value === "" || /^\d+$/.test(value)) {
      setBatchCount(value);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 border-b border-default-200 bg-background">
        <div className="flex items-center gap-3">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label="Back"
            onPress={onBack}
          >
            <ArrowLeft size={16} />
          </Button>
          <h2 className="text-lg font-semibold truncate max-w-[300px]">
            {tableName}
          </h2>
          <PresenceAvatars users={connectedUsers} />
          {isConnected ? (
            <div className="text-success" title={t("connected")}>
              <Wifi size={16} />
            </div>
          ) : (
            <div className="text-warning" title={t("offline")}>
              <WifiOff size={16} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Dropdown>
                <DropdownTrigger>
                  <Button
                    size="sm"
                    variant="flat"
                    startContent={<Columns size={14} />}
                    isDisabled={!canAddColumns}
                  >
                    {t("addColumn")}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  onAction={(key) => handleColumnTypeSelect(key as CellType)}
                >
                  <DropdownItem key="text">{t("textCell")}</DropdownItem>
                  <DropdownItem key="media">{t("mediaCell")}</DropdownItem>
                </DropdownMenu>
              </Dropdown>
              <Button
                size="sm"
                variant="flat"
                startContent={<Rows3 size={14} />}
                onPress={openRowModal}
                isDisabled={!canAddRows}
              >
                {t("addRow")}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="flat"
            startContent={<Share2 size={14} />}
            onPress={onShare}
          >
            {t("shareTable")}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        size="sm"
      >
        <ModalContent>
          <ModalHeader>
            {batchType === "row" ? t("batchAddRows") : t("batchAddColumns")}
          </ModalHeader>
          <ModalBody>
            <Input
              type="number"
              label={batchType === "row" ? t("numberOfRows") : t("numberOfColumns")}
              value={batchCount}
              onValueChange={handleCountChange}
              min={1}
              max={maxAdditional}
              autoFocus
              description={`1–${maxAdditional}`}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setBatchModalOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              color="primary"
              onPress={handleBatchConfirm}
              isDisabled={
                !batchCount ||
                isNaN(parseInt(batchCount, 10)) ||
                parseInt(batchCount, 10) < 1
              }
            >
              {t("add")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
});
