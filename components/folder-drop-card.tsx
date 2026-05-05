"use client";

import React, { useState } from "react";
import { Card, CardBody } from "@heroui/card";
import { Folder } from "lucide-react";
import { ASSET_DRAG_MIME } from "@/hooks/use-asset-drag-autoscroll";

export interface FolderDropCardProps {
  id: string;
  name: string;
  onOpen: (id: string) => void;
  onAssetDrop?: (assetId: string, folderId: string) => void;
  canAcceptDrop?: boolean;
}

export default function FolderDropCard({
  id,
  name,
  onOpen,
  onAssetDrop,
  canAcceptDrop = true,
}: FolderDropCardProps) {
  const [isOver, setIsOver] = useState(false);

  const hasAssetType = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(ASSET_DRAG_MIME);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canAcceptDrop || !onAssetDrop) return;
    if (!hasAssetType(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!isOver) setIsOver(true);
  };

  const handleDragLeave = () => {
    if (isOver) setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canAcceptDrop || !onAssetDrop) return;
    if (!hasAssetType(e)) return;
    e.preventDefault();
    const assetId = e.dataTransfer.getData(ASSET_DRAG_MIME);
    setIsOver(false);
    if (assetId) onAssetDrop(assetId, id);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Card
        isPressable
        onPress={() => onOpen(id)}
        className={`w-full hover:bg-default-100 transition-colors ${
          isOver ? "ring-2 ring-primary bg-primary/10" : ""
        }`}
      >
        <CardBody className="flex flex-row items-center gap-3 py-3">
          <Folder size={20} className="text-default-500 shrink-0" />
          <span className="font-medium truncate">{name}</span>
        </CardBody>
      </Card>
    </div>
  );
}
