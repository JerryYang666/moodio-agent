"use client";

import React, { memo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Plus, Columns, Rows3, Share2, Wifi, WifiOff } from "lucide-react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import type { ConnectionState } from "@/hooks/use-production-table-ws";
import type { CellType } from "@/lib/production-table/types";

interface ProductionTableToolbarProps {
  tableName: string;
  connectionState: ConnectionState;
  connectedUserCount: number;
  canEdit: boolean;
  onAddColumn: (cellType: CellType) => void;
  onAddRow: () => void;
  onShare: () => void;
}

export const ProductionTableToolbar = memo(function ProductionTableToolbar({
  tableName,
  connectionState,
  connectedUserCount,
  canEdit,
  onAddColumn,
  onAddRow,
  onShare,
}: ProductionTableToolbarProps) {
  const t = useTranslations("productionTable");
  const isConnected = connectionState === "connected";

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-default-200 bg-background">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold truncate max-w-[300px]">
          {tableName}
        </h2>
        <Chip
          size="sm"
          variant="dot"
          color={isConnected ? "success" : "warning"}
          startContent={
            isConnected ? <Wifi size={10} /> : <WifiOff size={10} />
          }
        >
          {connectedUserCount > 0 ? `${connectedUserCount + 1}` : "1"}
        </Chip>
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
                >
                  {t("addColumn")}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                onAction={(key) => onAddColumn(key as CellType)}
              >
                <DropdownItem key="text">{t("textCell")}</DropdownItem>
                <DropdownItem key="media">{t("mediaCell")}</DropdownItem>
              </DropdownMenu>
            </Dropdown>
            <Button
              size="sm"
              variant="flat"
              startContent={<Rows3 size={14} />}
              onPress={onAddRow}
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
  );
});
