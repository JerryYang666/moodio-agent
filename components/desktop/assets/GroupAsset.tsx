"use client";

import { useEffect, useState, useCallback } from "react";
import { Image } from "@heroui/image";
import { Layers, ChevronUp, ChevronDown, Image as ImageIcon, Film } from "lucide-react";
import { addToast } from "@heroui/toast";
import type { GroupAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { useGroup } from "@/hooks/use-group";
import GroupMemberGrid, {
  type GroupMember,
} from "@/components/groups/GroupMemberGrid";
import GroupGenerateMorePanel from "@/components/groups/GroupGenerateMorePanel";
import GroupDropZone, {
  type GroupDropPayload,
} from "@/components/groups/GroupDropZone";
import { AI_GROUP_DRAG_MIME } from "@/components/chat/asset-dnd";

interface GroupAssetProps {
  asset: EnrichedDesktopAsset;
  canEdit: boolean;
  zoom: number;
  /** Notify the parent when membership/cover changes so it can refresh metadata. */
  onMutated?: () => void;
}

export default function GroupAsset({
  asset,
  canEdit,
  zoom,
  onMutated,
}: GroupAssetProps) {
  const meta = asset.metadata as unknown as GroupAssetMeta;
  const [expanded, setExpanded] = useState(false);
  const {
    data,
    isLoading,
    refresh,
    setMemberStatus,
    setCover,
    removeMember,
    generateImage,
  } = useGroup(meta.folderId);

  const [generating, setGenerating] = useState(false);
  const [activeConfig, setActiveConfig] = useState<Record<string, unknown>>(
    meta as unknown as Record<string, unknown>
  );
  const [copiedFromMemberId, setCopiedFromMemberId] = useState<string | null>(
    null
  );

  // When the group loads, seed the form with defaultGenerationConfig.
  useEffect(() => {
    if (data) {
      setActiveConfig((prev) => {
        if (Object.keys(prev).length > 0 && copiedFromMemberId) return prev;
        return { ...data.defaultGenerationConfig };
      });
    }
  }, [data, copiedFromMemberId]);

  const handleCopyFrom = useCallback(
    (memberId: string | null) => {
      setCopiedFromMemberId(memberId);
      if (memberId && data) {
        const m = data.members.find((x) => x.id === memberId);
        if (m) setActiveConfig({ ...m.generationDetails });
      } else if (data) {
        setActiveConfig({ ...data.defaultGenerationConfig });
      }
    },
    [data]
  );

  const onSubmitGenerate = useCallback(
    async (config: Record<string, unknown>) => {
      if (!data) return;
      try {
        setGenerating(true);
        if (data.modality === "image") {
          await generateImage(config, copiedFromMemberId ?? undefined);
        } else {
          // Video path: hand off to existing video generate endpoint.
          const res = await fetch(`/api/video/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modelId: config.modelId,
              sourceImageId: config.sourceImageId,
              endImageId: config.endImageId,
              params: config.params || config,
              targetFolderId: data.folderId,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `Failed (${res.status})`);
          }
        }
        await refresh();
        onMutated?.();
      } catch (e) {
        addToast({
          title: "Generation failed",
          description: e instanceof Error ? e.message : "Unknown error",
          color: "danger",
        });
      } finally {
        setGenerating(false);
      }
    },
    [data, generateImage, refresh, copiedFromMemberId, onMutated]
  );

  const handleDrop = useCallback(
    async (payload: GroupDropPayload) => {
      if (!data) return;
      try {
        const res = await fetch(`/api/folders/${data.folderId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageId: payload.imageId,
            assetId: payload.assetId,
            assetType: payload.assetType,
            generationDetails: { title: "", prompt: "", status: "generated" },
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Failed (${res.status})`);
        }
        await refresh();
        onMutated?.();
      } catch (e) {
        addToast({
          title: "Failed to add asset",
          description: e instanceof Error ? e.message : "Unknown error",
          color: "danger",
        });
      }
    },
    [data, refresh, onMutated]
  );

  const ModalityIcon = meta.modality === "video" ? Film : ImageIcon;
  const memberCount = data?.members.length ?? meta.memberCount ?? 0;
  const coverUrl = (() => {
    if (!data) return null;
    if (!data.coverImageId) {
      const first = data.members[0];
      return first?.thumbnailSmUrl || first?.imageUrl || null;
    }
    const cover = data.members.find((m) => m.id === data.coverImageId);
    return cover?.thumbnailSmUrl || cover?.imageUrl || null;
  })();

  // Members shaped for the grid component
  const members: GroupMember[] = (data?.members ?? []).map((m) => ({
    id: m.id,
    imageId: m.imageId,
    videoId: m.assetType === "video" ? m.assetId : null,
    assetType: m.assetType,
    imageUrl: m.imageUrl,
    videoUrl: m.videoUrl,
    thumbnailSmUrl: m.thumbnailSmUrl,
    status: m.groupStatus,
    isCover: data?.coverImageId === m.id,
    prompt: m.prompt,
  }));

  const groupName = meta.name || data?.name || "Group";

  return (
    <GroupDropZone
      modality={meta.modality}
      canEdit={canEdit}
      onDrop={handleDrop}
      className="w-full h-full bg-content1 rounded-lg border border-divider overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-divider bg-content2/50 cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(
            AI_GROUP_DRAG_MIME,
            JSON.stringify({
              folderId: meta.folderId,
              modality: meta.modality,
              coverImageId: meta.coverImageId,
              memberCount,
              name: groupName,
            })
          );
          e.dataTransfer.effectAllowed = "copy";
        }}
        title="Drag to add this group to a production-table cell"
      >
        <Layers size={14} className="text-default-500" />
        <span className="text-sm font-semibold truncate flex-1">
          {groupName}
        </span>
        <div
          className="flex items-center gap-1 text-[10px] uppercase font-semibold text-default-500"
          title={`${meta.modality} group`}
        >
          <ModalityIcon size={11} />
          {meta.modality}
        </div>
        <div
          className="text-[11px] font-mono px-1.5 rounded bg-default-200/60 text-default-700"
          title={`${memberCount} members`}
        >
          ×{memberCount}
        </div>
        <button
          className="text-default-500 hover:text-default-800"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={expanded ? "Collapse" : "Expand"}
          style={{ transform: `scale(${1 / Math.max(zoom, 0.5)})`, transformOrigin: "right center" }}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Body */}
      {!expanded ? (
        <div className="relative flex-1 bg-default-100">
          {coverUrl ? (
            <Image
              alt={groupName}
              src={coverUrl}
              className="object-cover w-full h-full"
              removeWrapper
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-default-400 text-xs">
              {memberCount === 0
                ? `Empty ${meta.modality} group — drop an asset or generate`
                : "Loading…"}
            </div>
          )}
          {/* Stack-of-cards motif */}
          <div className="absolute -bottom-1 -right-1 w-full h-full border-r-2 border-b-2 border-divider/50 rounded-lg pointer-events-none" />
          <div className="absolute -bottom-2 -right-2 w-full h-full border-r-2 border-b-2 border-divider/30 rounded-lg pointer-events-none" />
        </div>
      ) : (
        <div
          className="flex-1 overflow-auto p-3"
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {isLoading && !data ? (
            <div className="text-center text-default-400 text-sm py-6">
              Loading…
            </div>
          ) : (
            <>
              <GroupMemberGrid
                members={members}
                canEdit={canEdit}
                onSetStatus={(id, status) =>
                  setMemberStatus(id, status).then(() => onMutated?.())
                }
                onSetCover={(id) =>
                  setCover(id).then(() => onMutated?.())
                }
                onRemove={
                  canEdit
                    ? (id) =>
                        removeMember(id).then(() => onMutated?.())
                    : undefined
                }
                onCopyConfigFrom={canEdit ? handleCopyFrom : undefined}
                compact
              />

              {canEdit && data && (
                <GroupGenerateMorePanel
                  modality={data.modality}
                  config={activeConfig}
                  members={data.members.map((m) => ({
                    id: m.id,
                    label: m.prompt
                      ? m.prompt.slice(0, 40)
                      : `Member ${m.id.slice(0, 6)}`,
                  }))}
                  copiedFromMemberId={copiedFromMemberId}
                  onCopiedFromChange={handleCopyFrom}
                  onSubmit={onSubmitGenerate}
                  isSubmitting={generating}
                />
              )}
            </>
          )}
        </div>
      )}
    </GroupDropZone>
  );
}
