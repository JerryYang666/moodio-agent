"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Image } from "@heroui/image";
import { Button } from "@heroui/button";
import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/modal";
import { Download, Video } from "lucide-react";
import VideoStatusChip from "@/components/video/video-status-chip";
import FakeProgressBar from "@/components/video/fake-progress-bar";
import VideoStatusOverlay from "@/components/video/video-status-overlay";
import VideoPlayOverlay from "@/components/video/video-play-overlay";
import VideoPlayer from "@/components/video/video-player";
import { useVideo } from "@/components/video-provider";
import { getVideoModel } from "@/lib/video/models";
import type { MessageContentPart } from "@/lib/llm/types";

type DirectVideoPart = Extract<MessageContentPart, { type: "direct_video" }>;

interface DirectVideoCardProps {
  part: DirectVideoPart;
  onStatusUpdate?: (updates: Partial<DirectVideoPart>) => void;
}

export default function DirectVideoCard({
  part,
  onStatusUpdate,
}: DirectVideoCardProps) {
  const t = useTranslations("storyboard");
  const { monitorGeneration, onGenerationUpdate, generationStatuses } =
    useVideo();
  const [showModal, setShowModal] = useState(false);

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

  // Monitor generation status when we have a generationId
  useEffect(() => {
    if (
      !part.generationId ||
      part.status === "completed" ||
      part.status === "failed"
    )
      return;
    monitorGeneration(part.generationId);
  }, [part.generationId, part.status, monitorGeneration]);

  // Listen for generation updates
  useEffect(() => {
    if (!part.generationId) return;

    const unsubscribe = onGenerationUpdate((generationId, status) => {
      if (generationId !== part.generationId) return;

      if (status === "completed" && onStatusUpdate) {
        // Fetch full generation details from API
        fetch(`/api/video/generations/${generationId}`)
          .then((res) => res.json())
          .then((data) => {
            const gen = data.generation;
            onStatusUpdate({
              status: "completed",
              videoId: gen?.id,
              videoUrl: gen?.videoUrl,
              signedVideoUrl: gen?.signedVideoUrl,
              thumbnailUrl: gen?.thumbnailUrl || part.thumbnailUrl,
              seed: gen?.seed,
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

  // Get effective status (check global cache for latest)
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

  return (
    <>
      <div className="relative group max-w-sm">
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

              {/* Status Overlay */}
              {effectiveStatus !== "completed" && (
                <VideoStatusOverlay
                  status={effectiveStatus}
                  processingLabel={t("generating")}
                  pendingLabel={t("queued")}
                  failedLabel={t("failed")}
                />
              )}

              {/* Play Button Overlay */}
              {effectiveStatus === "completed" && <VideoPlayOverlay />}
            </div>

            {/* Progress Bar */}
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
        {effectiveStatus === "completed" && part.videoUrl && (
          <div className="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10 flex gap-1">
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
          </div>
        )}
      </div>

      {/* Video Detail Modal */}
      <Modal
        isOpen={showModal}
        onOpenChange={setShowModal}
        size="4xl"
        scrollBehavior="inside"
        classNames={{
          base: "max-sm:m-0 max-sm:rounded-none",
          wrapper: "max-sm:items-end",
        }}
      >
        <ModalContent className="max-sm:max-h-[90vh]">
          {() => (
            <>
              <ModalHeader className="flex items-center gap-2 text-base sm:text-lg px-3 sm:px-6">
                <Video size={18} className="sm:w-5 sm:h-5" />
                {t("videoDetails")}
              </ModalHeader>
              <ModalBody className="px-3 sm:px-6 pb-6">
                <div className="space-y-3 sm:space-y-4">
                  <VideoPlayer
                    videoUrl={part.videoUrl ?? null}
                    signedVideoUrl={part.signedVideoUrl ?? null}
                    thumbnailUrl={part.thumbnailUrl ?? null}
                    fallbackImageUrl={part.config.sourceImageUrl ?? ""}
                    status={effectiveStatus}
                    videoId={part.generationId}
                  />

                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <VideoStatusChip
                      status={effectiveStatus}
                      responsive={false}
                    />
                    <span className="text-xs sm:text-sm text-default-500">
                      {formatDate(part.createdAt)}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs text-default-400 mb-1">
                      {t("model")}: {modelLabel}
                    </div>
                    <p className="text-sm text-default-700">
                      {part.config.prompt}
                    </p>
                  </div>

                  {effectiveStatus === "completed" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        startContent={<Download size={16} />}
                        onPress={handleDownload}
                      >
                        {t("download")}
                      </Button>
                    </div>
                  )}

                  {part.error && (
                    <div className="text-xs text-danger bg-danger-50 p-2 rounded-lg">
                      {part.error}
                    </div>
                  )}
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
