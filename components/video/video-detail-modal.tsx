"use client";

import { useState, useCallback, useEffect } from "react";
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
  ArrowUpCircle,
} from "lucide-react";
import VideoStatusChip from "@/components/video/video-status-chip";
import VideoPlayer from "@/components/video/video-player";
import { getVideoModel } from "@/lib/video/models";
import { getUserFriendlyErrorKey } from "@/lib/video/error-classify";
import { useCollections } from "@/hooks/use-collections";

export interface UpscaledVideoEntry {
  videoId: string;
  videoUrl: string;
  signedVideoUrl: string;
}

export interface UpscaledVideos {
  "1080p": UpscaledVideoEntry | null;
  "4k": UpscaledVideoEntry | null;
}

export interface VideoDetailData {
  id: string;
  modelId: string;
  provider: string | null;
  providerRequestId: string | null;
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
  upscaled?: UpscaledVideos | null;
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
  const [upscaleLoading, setUpscaleLoading] = useState<"1080p" | "4k" | null>(null);
  const [localUpscaled, setLocalUpscaled] = useState<Record<string, UpscaledVideoEntry>>({});

  useEffect(() => {
    if (!isOpen || !video || video.status !== "completed") return;
    if (video.upscaled) return;

    const VEO_IDS = new Set(["veo-3.1", "veo-3.1-first-last-frame"]);
    if (video.provider !== "kie" || !VEO_IDS.has(video.modelId)) return;

    fetch(`/api/video/generations/${video.id}`)
      .then((r) => r.json())
      .then((data) => {
        const u = data.generation?.upscaled;
        if (!u) return;
        const merged: Record<string, UpscaledVideoEntry> = {};
        if (u["1080p"]) merged["1080p"] = u["1080p"];
        if (u["4k"]) merged["4k"] = u["4k"];
        if (Object.keys(merged).length > 0) {
          setLocalUpscaled((prev) => ({ ...merged, ...prev }));
        }
      })
      .catch(() => {});
  }, [isOpen, video]);

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

  const VEO_MODEL_IDS = new Set(["veo-3.1", "veo-3.1-first-last-frame"]);
  const isVeoKie =
    video?.status === "completed" &&
    video.provider === "kie" &&
    VEO_MODEL_IDS.has(video.modelId);

  const handleUpscale = useCallback(
    async (resolution: "1080p" | "4k") => {
      if (!video) return;
      setUpscaleLoading(resolution);
      try {
        const res = await fetch(`/api/video/generations/${video.id}/upscale`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution }),
        });
        const data = await res.json();
        if (res.status === 402) {
          addToast({
            title: t("upscaleError"),
            description: t("upscaleInsufficientCredits"),
            color: "danger",
          });
          return;
        }
        if (!res.ok) {
          addToast({
            title: t("upscaleError"),
            description: data.error || "Request failed",
            color: "danger",
          });
          return;
        }
        if (data.status === "ready" && data.videoUrl) {
          setLocalUpscaled((prev) => ({
            ...prev,
            [resolution]: {
              videoId: data.videoId,
              videoUrl: data.videoUrl,
              signedVideoUrl: data.signedVideoUrl,
            },
          }));
          addToast({
            title: t("upscaleReady"),
            description: t("upscaleReadyDesc", { resolution: resolution.toUpperCase() }),
            color: "success",
          });
        } else {
          addToast({
            title: t("upscaleProcessing"),
            description: data.message || t("upscaleProcessingDesc"),
            color: "warning",
          });
        }
      } catch {
        addToast({
          title: t("upscaleError"),
          description: "Network error",
          color: "danger",
        });
      } finally {
        setUpscaleLoading(null);
      }
    },
    [video, t]
  );

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
                      <div className="text-xs sm:text-sm text-danger bg-danger-50 p-2 sm:p-3 rounded-lg space-y-1">
                        <p>{t(getUserFriendlyErrorKey(video.error))}</p>
                        <p className="text-danger/70">
                          {t("errorProviderReason", { reason: video.error })}
                        </p>
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

                    {isVeoKie && (
                      <div className="bg-default-100 p-3 sm:p-4 rounded-lg">
                        <h4 className="font-medium mb-1 sm:mb-2 text-sm sm:text-base">
                          {t("upscaleVideo")}
                        </h4>
                        <p className="text-xs text-default-500 mb-3">
                          {t("upscaleVideoDesc")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const saved1080p = localUpscaled["1080p"] || video.upscaled?.["1080p"];
                            const saved4k = localUpscaled["4k"] || video.upscaled?.["4k"];
                            return (
                              <>
                                {saved1080p ? (
                                  <Button
                                    variant="flat"
                                    color="success"
                                    size="sm"
                                    className="sm:size-md"
                                    startContent={<Download size={14} className="sm:w-4 sm:h-4" />}
                                    onPress={() => window.open(saved1080p.videoUrl, "_blank")}
                                  >
                                    {t("open1080p")}
                                  </Button>
                                ) : (
                                  <Button
                                    variant="flat"
                                    size="sm"
                                    className="sm:size-md"
                                    startContent={<ArrowUpCircle size={14} className="sm:w-4 sm:h-4" />}
                                    isLoading={upscaleLoading === "1080p"}
                                    isDisabled={upscaleLoading !== null}
                                    onPress={() => handleUpscale("1080p")}
                                  >
                                    {t("get1080pWithCost", { cost: 5 })}
                                  </Button>
                                )}
                                {saved4k ? (
                                  <Button
                                    variant="flat"
                                    color="success"
                                    size="sm"
                                    className="sm:size-md"
                                    startContent={<Download size={14} className="sm:w-4 sm:h-4" />}
                                    onPress={() => window.open(saved4k.videoUrl, "_blank")}
                                  >
                                    {t("open4k")}
                                  </Button>
                                ) : (
                                  <Button
                                    variant="flat"
                                    color="secondary"
                                    size="sm"
                                    className="sm:size-md"
                                    startContent={<ArrowUpCircle size={14} className="sm:w-4 sm:h-4" />}
                                    isLoading={upscaleLoading === "4k"}
                                    isDisabled={upscaleLoading !== null}
                                    onPress={() => handleUpscale("4k")}
                                  >
                                    {t("get4kWithCost", { cost: 100 })}
                                  </Button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
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
