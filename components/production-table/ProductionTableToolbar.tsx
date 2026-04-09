"use client";

import React, { memo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { ArrowLeft, Columns, Rows3, Share2, Wifi, WifiOff } from "lucide-react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { PresenceAvatars, type PresenceUser } from "@/components/PresenceAvatars";
import type { ConnectionState } from "@/hooks/use-production-table-ws";
import type { CellType } from "@/lib/production-table/types";

interface ProductionTableToolbarProps {
  tableName: string;
  connectionState: ConnectionState;
  connectedUsers: PresenceUser[];
  canEdit: boolean;
  canAddColumns?: boolean;
  canAddRows?: boolean;
  onBack: () => void;
  onAddColumn: (cellType: CellType) => void;
  onAddRow: () => void;
  onShare: () => void;
}

export const ProductionTableToolbar = memo(function ProductionTableToolbar({
  tableName,
  connectionState,
  connectedUsers,
  canEdit,
  canAddColumns = true,
  canAddRows = true,
  onBack,
  onAddColumn,
  onAddRow,
  onShare,
}: ProductionTableToolbarProps) {
  const t = useTranslations("productionTable");
  const isConnected = connectionState === "connected";

  return (
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
  );
});
