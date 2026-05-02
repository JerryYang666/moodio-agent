"use client";

import { Image } from "@heroui/image";
import { Star, ThumbsUp, Crown, X } from "lucide-react";

export type GroupMember = {
  /** collection_images.id */
  id: string;
  /** s3 imageId — thumbnail for both images and videos */
  imageId: string;
  /** s3 video id (only for video members) */
  videoId?: string | null;
  assetType: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailSmUrl?: string | null;
  status: "candidate" | "good" | "final" | null;
  isCover: boolean;
  prompt?: string;
};

interface GroupMemberGridProps {
  members: GroupMember[];
  canEdit: boolean;
  onSetStatus: (memberId: string, status: GroupMember["status"]) => void;
  onSetCover: (memberId: string) => void;
  onRemove?: (memberId: string) => void;
  onCopyConfigFrom?: (memberId: string) => void;
  /** Smaller thumbnails for the desktop in-canvas view */
  compact?: boolean;
}

const STATUS_CYCLE: Record<string, GroupMember["status"]> = {
  null: "candidate",
  candidate: "good",
  good: "final",
  final: null as unknown as GroupMember["status"],
};

export default function GroupMemberGrid({
  members,
  canEdit,
  onSetStatus,
  onSetCover,
  onRemove,
  onCopyConfigFrom,
  compact = false,
}: GroupMemberGridProps) {
  if (members.length === 0) {
    return (
      <div className="text-default-400 text-sm text-center py-6">
        No members yet — drag an asset in or hit Generate.
      </div>
    );
  }

  return (
    <div
      className={`grid gap-2 ${
        compact
          ? "grid-cols-3 sm:grid-cols-4"
          : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5"
      }`}
    >
      {members.map((m) => {
        const thumbSrc =
          m.thumbnailSmUrl || m.imageUrl || undefined;
        const statusKey = m.status ?? "null";
        return (
          <div
            key={m.id}
            className={`relative rounded-md overflow-hidden border transition-colors ${
              m.isCover
                ? "border-primary ring-2 ring-primary/40"
                : "border-divider"
            }`}
          >
            <div className="aspect-square bg-default-100 flex items-center justify-center">
              {thumbSrc ? (
                <Image
                  alt=""
                  src={thumbSrc}
                  className="object-cover w-full h-full"
                  removeWrapper
                />
              ) : m.videoUrl ? (
                <video
                  src={m.videoUrl}
                  className="object-cover w-full h-full"
                  muted
                />
              ) : (
                <div className="text-default-400 text-xs">No preview</div>
              )}
            </div>

            {/* Cover crown */}
            {m.isCover && (
              <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-0.5">
                <Crown size={10} />
              </div>
            )}

            {/* Status badge */}
            <div className="absolute top-1 right-1 flex gap-1">
              {m.status === "final" && (
                <div
                  className="bg-warning text-warning-foreground rounded-full p-0.5"
                  title="Final pick"
                >
                  <Star size={10} />
                </div>
              )}
              {m.status === "good" && (
                <div
                  className="bg-success text-success-foreground rounded-full p-0.5"
                  title="Good"
                >
                  <ThumbsUp size={10} />
                </div>
              )}
            </div>

            {/* Action overlay */}
            {canEdit && (
              <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors opacity-0 hover:opacity-100 flex flex-col items-center justify-center gap-1">
                <button
                  className="text-[10px] px-2 py-0.5 rounded bg-white/90 text-black hover:bg-white"
                  onClick={() =>
                    onSetStatus(m.id, STATUS_CYCLE[statusKey] ?? null)
                  }
                  title="Cycle status"
                >
                  {m.status ?? "mark"}
                </button>
                {!m.isCover && (
                  <button
                    className="text-[10px] px-2 py-0.5 rounded bg-white/90 text-black hover:bg-white"
                    onClick={() => onSetCover(m.id)}
                    title="Set as cover"
                  >
                    cover
                  </button>
                )}
                {onCopyConfigFrom && (
                  <button
                    className="text-[10px] px-2 py-0.5 rounded bg-white/90 text-black hover:bg-white"
                    onClick={() => onCopyConfigFrom(m.id)}
                    title="Use this config in the generate panel"
                  >
                    use config
                  </button>
                )}
                {onRemove && (
                  <button
                    className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-danger text-white flex items-center justify-center"
                    onClick={() => onRemove(m.id)}
                    title="Remove from group"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
