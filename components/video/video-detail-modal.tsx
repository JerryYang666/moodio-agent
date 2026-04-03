"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { hasWriteAccess } from "@/lib/permissions";
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
import {
  Video,
  Download,
  ExternalLink,
  RotateCcw,
  FolderPlus,
  Plus,
} from "lucide-react";
import VideoStatusChip from "@/components/video/video-status-chip";
import VideoPlayer from "@/components/video/video-player";
import { getVideoModel } from "@/lib/video/models";
import { getUserFriendlyErrorKey } from "@/lib/video/error-classify";
import { useCollections } from "@/hooks/use-collections";

export interface VideoDetailData {
  id: string;
  modelId: string;
  status: "pending" | "processing" | "completed" | "failed";
  sourceImageUrl: string;
  videoId: string | null;
  videoUrl: string | null;
  signedVideoUrl: string | null;
  thumbnailImageId: string | null;
  thumbnailUrl: string | null;
  params: Record<string, any>;
  error: string | null;
  seed: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface VideoRestoreData {
  modelId: string;
  sourceImageId: string;
  sourceImageUrl: string;
  endImageId: string | null;
  endImageUrl: string | null;
  params: Record<string, any>;
}

interface VideoDetailModalProps {
  video: VideoDetailData | null;
  isOpen: boolean;
  onClose: () => void;
  onRestore?: (data: VideoRestoreData) => void;
  restoreData?: VideoRestoreData | null;
}

export default function VideoDetailModal({
  video,
  isOpen,
  onClose,
  onRestore,
  restoreData,
}: VideoDetailModalProps) {
  const t = useTranslations("video");
  const tCommon = useTranslations("common");
  const tCollections = useTranslations("collections");
  const tMenu = useTranslations("imageMenu");

  const {
    collections,
    createCollection,
    addVideoToCollection,
    getDefaultCollectionName,
  } = useCollections();

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

  const handleDownload = useCallback(
    async (generationId: string) => {
      try {
        const filename = `video-${generationId}`;
        const response = await fetch(
          `/api/video/generations/${generationId}/download?filename=${encodeURIComponent(filename)}`
        );
        if (!response.ok)
          throw new Error(`Download failed: ${response.status}`);
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
    },
    []
  );

  const handleAddVideoToCollection = async (
    collectionId: string,
    gen: VideoDetailData
  ) => {
    if (!gen.videoId || !gen.thumbnailImageId) return;

    await addVideoToCollection(
      collectionId,
      gen.thumbnailImageId,
      gen.videoId,
      {
        title: gen.params.prompt?.slice(0, 50) || t("untitledVideo"),
        prompt: gen.params.prompt || "",
        status: gen.status,
      }
    );
  };

  const handleCreateNewCollection = () => {
    setNewCollectionName(getDefaultCollectionName());
    onCreateOpen();
  };

  const handleCreateAndAddVideo = async () => {
    if (!newCollectionName.trim() || !video) return;
    if (!video.videoId || !video.thumbnailImageId) return;

    setIsCreating(true);
    try {
      const collection = await createCollection(newCollectionName.trim());
      if (collection) {
        await addVideoToCollection(
          collection.id,
          video.thumbnailImageId,
          video.videoId,
          {
            title: video.params.prompt?.slice(0, 50) || t("untitledVideo"),
            prompt: video.params.prompt || "",
            status: video.status,
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

  const getModelLabel = (modelId: string) =>
    getVideoModel(modelId)?.name ?? modelId;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => !open && onClose()}
        size="4xl"
        scrollBehavior="inside"
        classNames={{
          base: "max-sm:m-0 max-sm:rounded-none",
          wrapper: "max-sm:items-end z-[70]",
        }}
      >
        <ModalContent className="max-sm:max-h-[90vh]">
          {(onModalClose) => (
            <>
              <ModalHeader className="flex items-center gap-2 text-base sm:text-lg px-3 sm:px-6">
                <Video size={18} className="sm:w-5 sm:h-5" />
                {t("videoDetails")}
              </ModalHeader>
              <ModalBody className="px-3 sm:px-6">
                {video && (
                  <div className="space-y-3 sm:space-y-4">
                    <VideoPlayer
                      videoUrl={video.videoUrl}
                      signedVideoUrl={video.signedVideoUrl}
                      thumbnailUrl={video.thumbnailUrl}
                      fallbackImageUrl={video.sourceImageUrl}
                      status={video.status}
                      videoId={video.id}
                    />

                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <VideoStatusChip
                        status={video.status}
                        responsive={false}
                      />
                      <span className="text-xs sm:text-sm text-default-500">
                        {t("created", {
                          date: formatDate(video.createdAt),
                        })}
                      </span>
                      {video.completedAt && (
                        <span className="text-xs sm:text-sm text-default-500">
                          {t("done", {
                            date: formatDate(video.completedAt),
                          })}
                        </span>
                      )}
                      {video.seed && (
                        <span className="text-xs sm:text-sm text-default-500">
                          {t("seed", { seed: video.seed })}
                        </span>
                      )}
                    </div>

                    {video.error && (
                      <div className="text-xs sm:text-sm text-danger bg-danger-50 p-2 sm:p-3 rounded-lg">
                        {t(getUserFriendlyErrorKey(video.error))}
                      </div>
                    )}

                    <div className="bg-default-100 p-3 sm:p-4 rounded-lg">
                      <h4 className="font-medium mb-1 sm:mb-2 text-sm sm:text-base">
                        {t("prompt")}
                      </h4>
                      <p className="text-xs sm:text-sm text-default-600 whitespace-pre-wrap">
                        {video.params.prompt || t("noPrompt")}
                      </p>
                    </div>

                    <div className="bg-default-100 p-3 sm:p-4 rounded-lg">
                      <h4 className="font-medium mb-1 sm:mb-2 text-sm sm:text-base">
                        {t("parameters")}
                      </h4>
                      <div className="grid grid-cols-2 gap-1 sm:gap-2 text-xs sm:text-sm">
                        {Object.entries(video.params)
                          .filter(
                            ([key]) =>
                              key !== "prompt" &&
                              key !== "image_url" &&
                              key !== "end_image_url"
                          )
                          .map(([key, value]) => (
                            <div key={key} className="truncate">
                              <span className="text-default-500">
                                {key}:{" "}
                              </span>
                              <span className="text-default-700">
                                {String(value)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter className="px-0 py-0 safe-area-bottom">
                <div className="flex flex-wrap gap-2 px-3 sm:px-6 pt-3 pb-3 w-full justify-end">
                  {video && onRestore && restoreData && (
                    <Button
                      variant="flat"
                      color="secondary"
                      size="sm"
                      className="sm:size-md flex-1 sm:flex-none"
                      startContent={
                        <RotateCcw size={14} className="sm:w-4 sm:h-4" />
                      }
                      onPress={() => {
                        onRestore(restoreData);
                        onClose();
                      }}
                    >
                      {t("putBack")}
                    </Button>
                  )}
                  {video?.status === "completed" && (
                    <>
                      {video.videoId && video.thumbnailImageId && (
                        <Dropdown>
                          <DropdownTrigger>
                            <Button
                              variant="flat"
                              size="sm"
                              className="sm:size-md flex-1 sm:flex-none"
                              startContent={
                                <FolderPlus
                                  size={14}
                                  className="sm:w-4 sm:h-4"
                                />
                              }
                            >
                              {tMenu("addToCollection")}
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
                              title={tCollections("createNewCollection")}
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
                                        handleAddVideoToCollection(
                                          collection.id,
                                          video
                                        )
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
                      {video.videoUrl && (
                        <>
                          <Button
                            variant="flat"
                            size="sm"
                            className="sm:size-md flex-1 sm:flex-none"
                            startContent={
                              <ExternalLink
                                size={14}
                                className="sm:w-4 sm:h-4"
                              />
                            }
                            onPress={() =>
                              window.open(video.videoUrl!, "_blank")
                            }
                          >
                            <span className="hidden sm:inline">
                              {t("openInNewTab")}
                            </span>
                            <span className="sm:hidden">{tCommon("open")}</span>
                          </Button>
                          <Button
                            color="primary"
                            size="sm"
                            className="sm:size-md flex-1 sm:flex-none"
                            startContent={
                              <Download size={14} className="sm:w-4 sm:h-4" />
                            }
                            onPress={() => handleDownload(video.id)}
                          >
                            {tCommon("download")}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  <Button
                    variant="light"
                    size="sm"
                    className="sm:size-md"
                    onPress={onModalClose}
                  >
                    {tCommon("close")}
                  </Button>
                </div>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

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
                      handleCreateAndAddVideo();
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
                  onPress={handleCreateAndAddVideo}
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
