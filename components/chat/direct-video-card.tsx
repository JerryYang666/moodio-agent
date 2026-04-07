"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { hasWriteAccess } from "@/lib/permissions";
import { trackResearchEvent } from "@/lib/research-telemetry-client";
import { Image } from "@heroui/image";
import { Button } from "@heroui/button";
import { addToast } from "@heroui/toast";
import { Input } from "@heroui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/dropdown";
import { Download, RotateCcw, FolderPlus, Plus } from "lucide-react";
import VideoStatusChip from "@/components/video/video-status-chip";
import FakeProgressBar from "@/components/video/fake-progress-bar";
import VideoStatusOverlay from "@/components/video/video-status-overlay";
import VideoPlayOverlay from "@/components/video/video-play-overlay";
import VideoDetailModal from "@/components/video/video-detail-modal";
import type {
  VideoDetailData,
  VideoRestoreData,
} from "@/components/video/video-detail-modal";
import { useVideo } from "@/components/video-provider";
import { useCollections } from "@/hooks/use-collections";
import { getVideoModel } from "@/lib/video/models";
import type { MessageContentPart } from "@/lib/llm/types";
import { AI_VIDEO_DRAG_MIME } from "@/components/chat/asset-dnd";

type DirectVideoPart = Extract<MessageContentPart, { type: "direct_video" }>;

interface DirectVideoCardProps {
  part: DirectVideoPart;
  onStatusUpdate?: (updates: Partial<DirectVideoPart>) => void;
  onRestore?: (data: VideoRestoreData) => void;
}

export default function DirectVideoCard({
  part,
  onStatusUpdate,
  onRestore,
}: DirectVideoCardProps) {
  const t = useTranslations("video");
  const tCollections = useTranslations("collections");
  const tMenu = useTranslations("imageMenu");
  const tCommon = useTranslations("common");
  const { monitorGeneration, onGenerationUpdate, generationStatuses } =
    useVideo();
  const {
    collections,
    createCollection,
    addVideoToCollection,
    getDefaultCollectionName,
  } = useCollections();
  const [showModal, setShowModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onOpenChange: onCreateOpenChange,
  } = useDisclosure();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const modelLabel =
    getVideoModel(part.config.modelId)?.name ?? part.config.modelId;

  useEffect(() => {
    if (
      !part.generationId ||
      part.status === "completed" ||
      part.status === "failed"
    )
      return;
    monitorGeneration(part.generationId);
  }, [part.generationId, part.status, monitorGeneration]);

  useEffect(() => {
    if (!part.generationId) return;

    const unsubscribe = onGenerationUpdate((generationId, status) => {
      if (generationId !== part.generationId) return;

      if (status === "completed" && onStatusUpdate) {
        fetch(`/api/video/generations/${generationId}`)
          .then((res) => res.json())
          .then((data) => {
            const gen = data.generation;
            onStatusUpdate({
              status: "completed",
              videoId: gen?.videoId,
              videoUrl: gen?.videoUrl,
              signedVideoUrl: gen?.signedVideoUrl,
              thumbnailImageId: gen?.thumbnailImageId,
              thumbnailUrl: gen?.thumbnailUrl || part.thumbnailUrl,
              seed: gen?.seed,
              completedAt: gen?.completedAt,
              provider: gen?.provider,
              providerRequestId: gen?.providerRequestId,
            });
          })
          .catch(() => {
            onStatusUpdate({ status: "completed" });
          });
      } else if (status === "failed" && onStatusUpdate) {
        onStatusUpdate({
          status: "failed",
          error: "Video generation failed",
        });
      }
    });

    return unsubscribe;
  }, [part.generationId, part.thumbnailUrl, onGenerationUpdate, onStatusUpdate]);

  const globalStatus = part.generationId
    ? generationStatuses[part.generationId]
    : null;
  const effectiveStatus = globalStatus || part.status;

  const handleDownload = useCallback(async () => {
    if (!part.generationId) return;
    try {
      const filename = `video-${part.generationId}`;
      const response = await fetch(
        `/api/video/generations/${part.generationId}/download?filename=${encodeURIComponent(filename)}`
      );
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download error:", e);
    }
  }, [part.generationId]);

  const restoreData: VideoRestoreData | null = {
    modelId: part.config.modelId,
    sourceImageId: part.config.sourceImageId,
    sourceImageUrl: part.config.sourceImageUrl ?? "",
    endImageId: part.config.endImageId ?? null,
    endImageUrl: part.config.endImageUrl ?? null,
    params: { prompt: part.config.prompt, ...part.config.params },
  };

  const videoDetailData: VideoDetailData | null = part.generationId
    ? {
        id: part.generationId,
        modelId: part.config.modelId,
        provider: part.provider ?? null,
        providerRequestId: part.providerRequestId ?? null,
        status: effectiveStatus,
        sourceImageUrl: part.config.sourceImageUrl ?? "",
        videoId: part.videoId ?? null,
        videoUrl: part.videoUrl ?? null,
        signedVideoUrl: part.signedVideoUrl ?? null,
        thumbnailImageId: part.thumbnailImageId ?? null,
        thumbnailUrl: part.thumbnailUrl ?? null,
        params: { prompt: part.config.prompt, ...part.config.params },
        error: part.error ?? null,
        seed: part.seed ?? null,
        createdAt: part.createdAt,
        completedAt: part.completedAt ?? null,
      }
    : null;

  const handleAddToCollection = async (collectionId: string) => {
    if (!part.videoId || !part.thumbnailImageId) return;
    await addVideoToCollection(collectionId, part.thumbnailImageId, part.videoId, {
      title: part.config.prompt?.slice(0, 50) || t("untitledVideo"),
      prompt: part.config.prompt || "",
      status: effectiveStatus,
    });
  };

  const handleCreateNewCollection = () => {
    setNewCollectionName(getDefaultCollectionName());
    onCreateOpen();
  };

  const handleCreateAndAdd = async () => {
    if (!newCollectionName.trim() || !part.videoId || !part.thumbnailImageId) return;
    setIsCreating(true);
    try {
      const collection = await createCollection(newCollectionName.trim());
      if (collection) {
        await addVideoToCollection(
          collection.id,
          part.thumbnailImageId!,
          part.videoId!,
          {
            title: part.config.prompt?.slice(0, 50) || t("untitledVideo"),
            prompt: part.config.prompt || "",
            status: effectiveStatus,
          }
        );
        setNewCollectionName("");
        onCreateOpenChange();
      }
    } catch (error: any) {
      const msg = error?.status === 409 ? tCollections("duplicateName") : tCollections("createFailed");
      addToast({ title: tCollections("error"), description: msg, color: "danger" });
    } finally {
      setIsCreating(false);
    }
  };

  const handlePlaybackStarted = useMemo(() => {
    return () => {
      trackResearchEvent({
        eventType: "video_playback_started",
        metadata: {
          generationId: part.generationId,
          sourceImageId: part.config.sourceImageId,
          videoId: part.videoId,
        },
      });
    };
  }, [part.generationId, part.config.sourceImageId, part.videoId]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (effectiveStatus !== "completed" || !part.videoId || !part.thumbnailImageId) return;
    const payload = {
      videoId: part.videoId,
      thumbnailImageId: part.thumbnailImageId,
      thumbnailUrl: part.thumbnailUrl || part.config.sourceImageUrl || "",
      videoUrl: part.videoUrl || "",
      prompt: part.config.prompt || "",
    };
    try {
      e.dataTransfer.setData(AI_VIDEO_DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "copy";
    } catch (err) {
      console.error("Failed to start video drag", err);
    }
  }, [effectiveStatus, part.videoId, part.thumbnailImageId, part.thumbnailUrl, part.config.sourceImageUrl, part.videoUrl, part.config.prompt]);

  return (
    <>
      <div
        className="relative group max-w-sm"
        draggable={effectiveStatus === "completed" && !!part.videoId && !!part.thumbnailImageId}
        onDragStart={handleDragStart}
      >
        <button
          onClick={() =>
            (effectiveStatus === "completed" || effectiveStatus === "failed") &&
            setShowModal(true)
          }
          className="text-left w-full"
        >
          <div className="rounded-lg overflow-hidden border border-divider bg-default-50 hover:border-primary transition-colors">
            {/* Thumbnail */}
            <div className="relative aspect-video bg-default-100">
              <Image
                src={part.thumbnailUrl || part.config.sourceImageUrl}
                alt={t("videoThumbnailAlt")}
                radius="none"
                classNames={{
                  wrapper: "w-full h-full !max-w-full",
                  img: "w-full h-full object-cover",
                }}
              />

              {effectiveStatus !== "completed" && (
                <VideoStatusOverlay
                  status={effectiveStatus}
                  processingLabel={t("generating")}
                  pendingLabel={t("queued")}
                  failedLabel={t("failed")}
                />
              )}

              {effectiveStatus === "completed" && <VideoPlayOverlay />}
            </div>

            <FakeProgressBar
              status={effectiveStatus}
              createdAt={part.createdAt}
            />

            {/* Info */}
            <div className="p-2 sm:p-3">
              <div className="flex items-center justify-between mb-1 gap-1">
                <VideoStatusChip status={effectiveStatus} />
                <span className="text-[10px] sm:text-xs text-default-400 shrink-0">
                  {formatDate(part.createdAt)}
                </span>
              </div>
              <div className="text-[10px] sm:text-xs text-default-400 mb-1">
                {t("model")}: {modelLabel}
              </div>
              <p className="text-xs sm:text-sm text-default-600 line-clamp-2">
                {part.config.prompt || t("noPrompt")}
              </p>
            </div>
          </div>
        </button>

        {/* Quick Actions */}
        {effectiveStatus === "completed" &&
          (part.videoUrl || onRestore || (part.videoId && part.thumbnailImageId)) && (
          <div className="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10 flex gap-1">
            {part.videoUrl && (
              <Button
                isIconOnly
                size="sm"
                variant="solid"
                className="bg-background/80 backdrop-blur-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
              >
                <Download size={16} />
              </Button>
            )}
            {onRestore && (
              <Button
                isIconOnly
                size="sm"
                variant="solid"
                className="bg-background/80 backdrop-blur-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore(restoreData);
                }}
              >
                <RotateCcw size={16} />
              </Button>
            )}
            {part.videoId && part.thumbnailImageId && (
              <Dropdown>
                <DropdownTrigger>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="solid"
                    className="bg-background/80 backdrop-blur-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FolderPlus size={16} />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label={t("videoActions")}
                  onAction={(key) => {
                    if (key === "create-new") {
                      handleCreateNewCollection();
                    }
                  }}
                >
                  <DropdownSection
                    title={tMenu("addToCollection")}
                    showDivider
                  >
                    <DropdownItem
                      key="create-new"
                      startContent={<Plus size={16} />}
                      className="font-semibold"
                    >
                      {tCollections("createNewCollection")}
                    </DropdownItem>
                  </DropdownSection>
                  <DropdownSection
                    title={
                      collections.length > 0
                        ? tMenu("yourCollections")
                        : undefined
                    }
                  >
                    {collections.length === 0 ? (
                      <DropdownItem key="no-collections" isReadOnly>
                        <span className="text-xs text-default-400">
                          {tCollections("noCollectionsYet")}
                        </span>
                      </DropdownItem>
                    ) : (
                      collections
                        .filter((c) => hasWriteAccess(c.permission))
                        .map((collection) => (
                          <DropdownItem
                            key={collection.id}
                            startContent={<FolderPlus size={16} />}
                            onPress={() =>
                              handleAddToCollection(collection.id)
                            }
                          >
                            {collection.name}
                          </DropdownItem>
                        ))
                    )}
                  </DropdownSection>
                </DropdownMenu>
              </Dropdown>
            )}
          </div>
        )}
      </div>

      <VideoDetailModal
        video={videoDetailData}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onRestore={onRestore}
        restoreData={restoreData}
        onPlaybackStarted={handlePlaybackStarted}
      />

      {/* Create Collection Modal (for card-level quick action) */}
      <Modal isOpen={isCreateOpen} onOpenChange={onCreateOpenChange}>
        <ModalContent>
          {(onModalClose) => (
            <>
              <ModalHeader>{tCollections("createNewCollection")}</ModalHeader>
              <ModalBody>
                <Input
                  label={tCollections("collectionName")}
                  placeholder={tCollections("enterCollectionName")}
                  value={newCollectionName}
                  onValueChange={setNewCollectionName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateAndAdd();
                    }
                  }}
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onModalClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleCreateAndAdd}
                  isLoading={isCreating}
                  isDisabled={!newCollectionName.trim()}
                >
                  {tMenu("createAndAdd")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
