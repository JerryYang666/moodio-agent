"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
} from "@heroui/modal";
import { Image as ImageIcon, Film, Layers } from "lucide-react";
import { addToast } from "@heroui/toast";
import { useGroup } from "@/hooks/use-group";
import GroupMemberGrid, {
  type GroupMember,
} from "@/components/groups/GroupMemberGrid";
import GroupGenerateMorePanel from "@/components/groups/GroupGenerateMorePanel";
import GroupDropZone, {
  type GroupDropPayload,
} from "@/components/groups/GroupDropZone";

interface GroupDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string | null;
  modality: "image" | "video";
  canEdit: boolean;
  /**
   * Called when group state changes so callers (e.g. MediaCell) can refresh
   * their denormalized cover + count.
   */
  onMutated?: () => void;
  /**
   * Production-table WS sendEvent. Group mutations are broadcast as
   * `pt_group_mutated` so other clients viewing the same table refresh.
   */
  sendEvent?: (type: string, payload: Record<string, unknown>) => void;
}

export default function GroupDetailDrawer({
  isOpen,
  onClose,
  folderId,
  modality,
  canEdit,
  onMutated,
  sendEvent,
}: GroupDetailDrawerProps) {
  const {
    data,
    isLoading,
    refresh,
    setMemberStatus,
    setCover,
    removeMember,
    generateImage,
    addMember,
    notifyMutation,
  } = useGroup(folderId, {
    sendEvent,
    broadcastEventType: "pt_group_mutated",
  });

  const [generating, setGenerating] = useState(false);
  const [activeConfig, setActiveConfig] = useState<Record<string, unknown>>({});
  const [copiedFromMemberId, setCopiedFromMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (data) setActiveConfig({ ...data.defaultGenerationConfig });
  }, [data]);

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
          // Image-group case already broadcasts via useGroup.generateImage;
          // for the video path we manually notify peers.
          await refresh();
          notifyMutation();
        }
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
      if (!folderId) return;
      try {
        await addMember({
          imageId: payload.imageId,
          assetId: payload.assetId,
          assetType: payload.assetType,
          thumbnailImageId: payload.thumbnailImageId,
        });
        onMutated?.();
      } catch (e) {
        addToast({
          title: "Failed to add asset",
          description: e instanceof Error ? e.message : "Unknown error",
          color: "danger",
        });
      }
    },
    [folderId, addMember, onMutated]
  );

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

  const ModalityIcon = modality === "video" ? Film : ImageIcon;

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} size="3xl">
      <ModalContent>
        <ModalHeader>
          <div className="flex items-center gap-2">
            <Layers size={16} />
            <span>{data?.name || "Group"}</span>
            <div className="text-[10px] uppercase font-semibold text-default-500 flex items-center gap-1">
              <ModalityIcon size={11} />
              {modality}
            </div>
            <span className="text-default-400 text-sm">
              ×{data?.members.length ?? 0}
            </span>
          </div>
        </ModalHeader>
        <ModalBody className="pb-6">
          <GroupDropZone
            modality={modality}
            canEdit={canEdit}
            onDrop={handleDrop}
            className="rounded-md p-2"
          >
            {isLoading && !data ? (
              <div className="text-center text-default-400 py-6">Loading…</div>
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
          </GroupDropZone>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
