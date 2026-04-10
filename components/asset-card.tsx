"use client";

import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import {
  MoreVertical,
  Eye,
  Pencil,
  Move,
  Copy,
  LayoutDashboard,
  MessageSquare,
  Trash2,
  Play,
  Music,
  Check,
  Star,
} from "lucide-react";
import AudioPlayer from "@/components/audio-player";
import type { AssetItem } from "@/lib/types/asset";

export interface AssetCardLabels {
  video: string;
  viewDetails: string;
  rename: string;
  moveTo: string;
  copyTo: string;
  sendToDesktop: string;
  goToChat: string;
  remove: string;
}

export interface AssetCardProps {
  asset: AssetItem;
  isSelectionMode: boolean;
  isSelected: boolean;
  canWrite: boolean;
  showChat: boolean;
  hoveredRating: { assetId: string; star: number } | null;
  onHoverRating: (value: { assetId: string; star: number } | null) => void;
  onClick: (asset: AssetItem) => void;
  onToggleSelection: (id: string) => void;
  onRate: (asset: AssetItem, star: number) => void;
  onRename: (asset: AssetItem) => void;
  onMove: (asset: AssetItem) => void;
  onCopy: (asset: AssetItem) => void;
  onDesktop: (asset: AssetItem) => void;
  onChat?: (asset: AssetItem) => void;
  onRemove: (asset: AssetItem) => void;
  labels: AssetCardLabels;
}

export default function AssetCard({
  asset,
  isSelectionMode,
  isSelected,
  canWrite,
  showChat,
  hoveredRating,
  onHoverRating,
  onClick,
  onToggleSelection,
  onRate,
  onRename,
  onMove,
  onCopy,
  onDesktop,
  onChat,
  onRemove,
  labels,
}: AssetCardProps) {
  const preview =
    hoveredRating?.assetId === asset.id ? hoveredRating.star : null;

  return (
    <Card
      className={`group relative ${isSelectionMode && isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
    >
      <CardBody className="p-0 overflow-hidden aspect-square relative rounded-lg">
        {asset.assetType === "audio" ? (
          <div
            className={`w-full h-full cursor-pointer bg-linear-to-br from-violet-500/20 to-purple-600/20 ${isSelectionMode && isSelected ? "opacity-80" : ""}`}
            onClick={() => onClick(asset)}
          >
            {asset.audioUrl ? (
              <AudioPlayer src={asset.audioUrl} variant="compact" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music size={48} className="text-violet-400" />
              </div>
            )}
          </div>
        ) : asset.assetType === "public_video" && asset.videoUrl ? (
          <div
            className={`w-full h-full cursor-pointer ${isSelectionMode && isSelected ? "opacity-80" : ""}`}
            onClick={() => onClick(asset)}
          >
            <video
              src={asset.videoUrl}
              muted
              loop
              playsInline
              autoPlay
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <Image
            src={asset.imageUrl}
            alt={asset.generationDetails?.title || "Asset"}
            radius="none"
            classNames={{
              wrapper: "w-full h-full !max-w-full cursor-pointer",
              img: `w-full h-full object-cover transition-opacity ${isSelectionMode && isSelected ? "opacity-80" : ""}`,
            }}
            onClick={() => onClick(asset)}
          />
        )}

        {/* Selection checkbox */}
        {isSelectionMode && (
          <div
            className="absolute top-2 left-2 z-20 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection(asset.id);
            }}
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${isSelected ? "bg-primary text-white" : "bg-background/80 backdrop-blur-sm border border-default-300"}`}
            >
              {isSelected && <Check size={14} />}
            </div>
          </div>
        )}

        {/* Audio badge */}
        {asset.assetType === "audio" && (
          <div
            className={`absolute ${isSelectionMode ? "top-2 left-10" : "top-2 left-2"} z-10`}
          >
            <div className="bg-violet-600/70 text-white rounded-full p-1.5 flex items-center gap-1">
              <Music size={12} />
              <span className="text-[10px] font-medium pr-1">Audio</span>
            </div>
          </div>
        )}

        {/* Video badge */}
        {(asset.assetType === "video" || asset.assetType === "public_video") && (
          <div
            className={`absolute ${isSelectionMode ? "top-2 left-10" : "top-2 left-2"} z-10`}
          >
            <div className="bg-black/70 text-white rounded-full p-1.5 flex items-center gap-1">
              <Play size={12} fill="white" />
              <span className="text-[10px] font-medium pr-1">
                {labels.video}
              </span>
            </div>
          </div>
        )}

        {/* Gradient overlay with title + stars */}
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-black/70 to-transparent pt-6 pb-1.5 px-2">
          <p className="text-xs text-white truncate pointer-events-none">
            {asset.generationDetails?.title || "Untitled"}
          </p>
          <div
            className="flex gap-0.5 mt-0.5"
            onMouseLeave={() => onHoverRating(null)}
          >
            {[1, 2, 3, 4, 5].map((star) => {
              const filled =
                preview !== null
                  ? star <= preview
                  : star <= (asset.rating ?? 0);
              return (
                <button
                  key={star}
                  type="button"
                  className="p-0 leading-none cursor-pointer"
                  onMouseEnter={() =>
                    onHoverRating({ assetId: asset.id, star })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onRate(asset, star);
                  }}
                >
                  <Star
                    size={14}
                    className={
                      filled
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-white/50"
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Dropdown menu */}
        {canWrite && !isSelectionMode && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <Dropdown>
              <DropdownTrigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="solid"
                  className="bg-background/80 backdrop-blur-sm"
                >
                  <MoreVertical size={16} />
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Asset actions">
                <DropdownItem
                  key="view"
                  startContent={<Eye size={16} />}
                  onPress={() => onClick(asset)}
                >
                  {labels.viewDetails}
                </DropdownItem>
                <DropdownItem
                  key="rename"
                  startContent={<Pencil size={16} />}
                  onPress={() => onRename(asset)}
                >
                  {labels.rename}
                </DropdownItem>
                <DropdownItem
                  key="move"
                  startContent={<Move size={16} />}
                  onPress={() => onMove(asset)}
                >
                  {labels.moveTo}
                </DropdownItem>
                <DropdownItem
                  key="copy"
                  startContent={<Copy size={16} />}
                  onPress={() => onCopy(asset)}
                >
                  {labels.copyTo}
                </DropdownItem>
                <DropdownItem
                  key="desktop"
                  startContent={<LayoutDashboard size={16} />}
                  onPress={() => onDesktop(asset)}
                >
                  {labels.sendToDesktop}
                </DropdownItem>
                {showChat && asset.chatId ? (
                  <DropdownItem
                    key="chat"
                    startContent={<MessageSquare size={16} />}
                    onPress={() => onChat?.(asset)}
                  >
                    {labels.goToChat}
                  </DropdownItem>
                ) : null}
                <DropdownItem
                  key="remove"
                  className="text-danger"
                  color="danger"
                  startContent={<Trash2 size={16} />}
                  onPress={() => onRemove(asset)}
                >
                  {labels.remove}
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
