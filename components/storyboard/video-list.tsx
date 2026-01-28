"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import {
  Video,
  RefreshCw,
  Play,
  Download,
  Clock,
  XCircle,
  Loader2,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import type { VideoGenerationRestore } from "./video-generation-panel";
import VideoStatusChip from "./video-status-chip";
import { getVideoModel } from "@/lib/video/models";

interface VideoGeneration {
  id: string;
  modelId: string;
  status: "pending" | "processing" | "completed" | "failed";
  sourceImageId: string;
  sourceImageUrl: string;
  endImageId: string | null;
  endImageUrl: string | null;
  videoId: string | null;
  videoUrl: string | null;
  thumbnailImageId: string | null;
  thumbnailUrl: string | null;
  params: Record<string, any>;
  error: string | null;
  seed: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface VideoListProps {
  refreshTrigger?: number;
  onRestore?: (data: VideoGenerationRestore) => void;
}

const POLL_INTERVAL = 5000; // 5 seconds

export default function VideoList({ refreshTrigger, onRestore }: VideoListProps) {
  const t = useTranslations("video");
  const tCommon = useTranslations("common");
  const [generations, setGenerations] = useState<VideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoGeneration | null>(
    null
  );

  const fetchGenerations = useCallback(async () => {
    try {
      const res = await fetch("/api/video/generations?limit=50");
      if (!res.ok) throw new Error(t("failedToLoadVideos"));
      const data = await res.json();
      setGenerations(data.generations);
      setError(null);
    } catch (e) {
      console.error("Error fetching generations:", e);
      setError(t("failedToLoadVideos"));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  // Refresh when trigger changes
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      fetchGenerations();
    }
  }, [refreshTrigger, fetchGenerations]);

  // Poll for updates when there are pending/processing jobs
  useEffect(() => {
    const hasPending = generations.some(
      (g) => g.status === "pending" || g.status === "processing"
    );

    if (!hasPending) return;

    const interval = setInterval(fetchGenerations, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [generations, fetchGenerations]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleDownload = async (generationId: string, filename: string) => {
    try {
      // Use our proxy endpoint to avoid CORS issues with S3
      const response = await fetch(
        `/api/video/generations/${generationId}/download?filename=${encodeURIComponent(filename)}`
      );
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
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
  };

  const getModelLabel = (modelId: string) =>
    getVideoModel(modelId)?.name ?? modelId;

  const handleRestore = (gen: VideoGeneration) => {
    if (!onRestore) return;
    
    onRestore({
      modelId: gen.modelId,
      sourceImageId: gen.sourceImageId,
      sourceImageUrl: gen.sourceImageUrl,
      endImageId: gen.endImageId,
      endImageUrl: gen.endImageUrl,
      params: gen.params,
    });
    
    // Close the modal after restoring
    setSelectedVideo(null);
  };

  if (loading) {
    return (
      <Card className="h-full shadow-none">
        <CardBody className="flex items-center justify-center">
          <Spinner />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full overflow-hidden flex flex-col shadow-none">
        <CardHeader className="flex items-center justify-between shrink-0 px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Video size={18} className="text-primary sm:w-5 sm:h-5" />
            <h2 className="text-base sm:text-lg font-semibold">
              {t("yourVideos")}
            </h2>
            <Chip size="sm" variant="flat">
              {t("videoCount", { count: generations.length })}
            </Chip>
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={fetchGenerations}
          >
            <RefreshCw size={16} />
          </Button>
        </CardHeader>

        <CardBody className="overflow-auto pt-0 px-3 sm:px-4">
          {error && (
            <div className="text-xs sm:text-sm text-danger bg-danger-50 p-2 sm:p-3 rounded-lg mb-3 sm:mb-4">
              {error}
            </div>
          )}

          {generations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 sm:h-64 text-center px-4">
              <Video
                size={40}
                className="sm:w-12 sm:h-12 text-default-300 mb-3 sm:mb-4"
              />
              <p className="text-default-500 text-sm sm:text-base">
                {t("noVideosYet")}
              </p>
              <p className="text-xs sm:text-sm text-default-400">
                {t("generateFirstVideo")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
              {generations.map((gen) => (
                <button
                  key={gen.id}
                  onClick={() => setSelectedVideo(gen)}
                  className="text-left group"
                >
                  <div className="rounded-lg overflow-hidden border border-divider bg-default-50 hover:border-primary transition-colors">
                    {/* Thumbnail */}
                    <div className="relative aspect-video bg-default-100">
                      <Image
                        src={gen.thumbnailUrl || gen.sourceImageUrl}
                        alt={t("videoThumbnailAlt")}
                        radius="none"
                        classNames={{
                          wrapper: "w-full h-full !max-w-full",
                          img: "w-full h-full object-cover",
                        }}
                      />

                      {/* Status Overlay */}
                      {gen.status !== "completed" && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          {gen.status === "processing" && (
                            <div className="text-center">
                              <Loader2
                                size={24}
                                className="sm:w-8 sm:h-8 text-white animate-spin mx-auto mb-1 sm:mb-2"
                              />
                              <span className="text-white text-xs sm:text-sm">
                                {t("generating")}
                              </span>
                            </div>
                          )}
                          {gen.status === "pending" && (
                            <div className="text-center">
                              <Clock
                                size={24}
                                className="sm:w-8 sm:h-8 text-white mx-auto mb-1 sm:mb-2"
                              />
                              <span className="text-white text-xs sm:text-sm">
                                {t("queued")}
                              </span>
                            </div>
                          )}
                          {gen.status === "failed" && (
                            <div className="text-center">
                              <XCircle
                                size={24}
                                className="sm:w-8 sm:h-8 text-danger mx-auto mb-1 sm:mb-2"
                              />
                              <span className="text-white text-xs sm:text-sm">
                                {t("failed")}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Play Button Overlay */}
                      {gen.status === "completed" && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 sm:transition-opacity">
                          <div className="bg-black/50 rounded-full p-2 sm:p-3">
                            <Play
                              size={20}
                              className="sm:w-6 sm:h-6 text-white"
                              fill="white"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-2 sm:p-3">
                      <div className="flex items-center justify-between mb-1 gap-1">
                        <VideoStatusChip status={gen.status} />
                        <span className="text-[10px] sm:text-xs text-default-400 shrink-0">
                          {formatDate(gen.createdAt)}
                        </span>
                      </div>
                      <div className="text-[10px] sm:text-xs text-default-400 mb-1">
                        {t("model")}: {getModelLabel(gen.modelId)}
                      </div>
                      <p className="text-xs sm:text-sm text-default-600 line-clamp-2">
                        {gen.params.prompt || t("noPrompt")}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Video Detail Modal */}
      <Modal
        isOpen={!!selectedVideo}
        onOpenChange={() => setSelectedVideo(null)}
        size="4xl"
        scrollBehavior="inside"
        classNames={{
          base: "max-sm:m-0 max-sm:rounded-none",
          wrapper: "max-sm:items-end",
        }}
      >
        <ModalContent className="max-sm:max-h-[90vh]">
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2 text-base sm:text-lg px-3 sm:px-6">
                <Video size={18} className="sm:w-5 sm:h-5" />
                {t("videoDetails")}
              </ModalHeader>
              <ModalBody className="px-3 sm:px-6">
                {selectedVideo && (
                  <div className="space-y-3 sm:space-y-4">
                    {/* Video Player / Preview */}
                    <div className="rounded-lg overflow-hidden bg-black">
                      {selectedVideo.status === "completed" &&
                      selectedVideo.videoUrl ? (
                        <video
                          src={selectedVideo.videoUrl}
                          controls
                          autoPlay
                          playsInline
                          className="w-full max-h-[40vh] sm:max-h-[60vh]"
                        />
                      ) : (
                        <div className="aspect-video flex items-center justify-center relative">
                          <Image
                            src={
                              selectedVideo.thumbnailUrl ||
                              selectedVideo.sourceImageUrl
                            }
                            alt={t("thumbnailAlt")}
                            classNames={{
                              wrapper: "w-full h-full",
                              img: "w-full h-full object-contain",
                            }}
                          />
                          {selectedVideo.status !== "completed" && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              {selectedVideo.status === "processing" && (
                                <Loader2
                                  size={32}
                                  className="sm:w-12 sm:h-12 text-white animate-spin"
                                />
                              )}
                              {selectedVideo.status === "pending" && (
                                <Clock
                                  size={32}
                                  className="sm:w-12 sm:h-12 text-white"
                                />
                              )}
                              {selectedVideo.status === "failed" && (
                                <XCircle
                                  size={32}
                                  className="sm:w-12 sm:h-12 text-danger"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status & Info - Mobile optimized */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <VideoStatusChip
                        status={selectedVideo.status}
                        responsive={false}
                      />
                      <span className="text-xs sm:text-sm text-default-500">
                        {t("created", {
                          date: formatDate(selectedVideo.createdAt),
                        })}
                      </span>
                      {selectedVideo.completedAt && (
                        <span className="text-xs sm:text-sm text-default-500">
                          {t("done", {
                            date: formatDate(selectedVideo.completedAt),
                          })}
                        </span>
                      )}
                      {selectedVideo.seed && (
                        <span className="text-xs sm:text-sm text-default-500">
                          {t("seed", { seed: selectedVideo.seed })}
                        </span>
                      )}
                    </div>

                    {/* Error */}
                    {selectedVideo.error && (
                      <div className="text-xs sm:text-sm text-danger bg-danger-50 p-2 sm:p-3 rounded-lg">
                        {selectedVideo.error}
                      </div>
                    )}

                    {/* Prompt */}
                    <div className="bg-default-100 p-3 sm:p-4 rounded-lg">
                      <h4 className="font-medium mb-1 sm:mb-2 text-sm sm:text-base">
                        {t("prompt")}
                      </h4>
                      <p className="text-xs sm:text-sm text-default-600 whitespace-pre-wrap">
                        {selectedVideo.params.prompt || t("noPrompt")}
                      </p>
                    </div>

                    {/* Parameters */}
                    <div className="bg-default-100 p-3 sm:p-4 rounded-lg">
                      <h4 className="font-medium mb-1 sm:mb-2 text-sm sm:text-base">
                        {t("parameters")}
                      </h4>
                      <div className="grid grid-cols-2 gap-1 sm:gap-2 text-xs sm:text-sm">
                        {Object.entries(selectedVideo.params)
                          .filter(
                            ([key]) =>
                              key !== "prompt" &&
                              key !== "image_url" &&
                              key !== "end_image_url"
                          )
                          .map(([key, value]) => (
                            <div key={key} className="truncate">
                              <span className="text-default-500">{key}: </span>
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
              <ModalFooter className="flex-wrap gap-2 px-3 sm:px-6 safe-area-bottom">
                {/* Put Back button - restore generation parameters */}
                {selectedVideo && onRestore && (
                  <Button
                    variant="flat"
                    color="secondary"
                    size="sm"
                    className="sm:size-md flex-1 sm:flex-none"
                    startContent={
                      <RotateCcw size={14} className="sm:w-4 sm:h-4" />
                    }
                    onPress={() => handleRestore(selectedVideo)}
                  >
                    {t("putBack")}
                  </Button>
                )}
                {selectedVideo?.status === "completed" &&
                  selectedVideo.videoUrl && (
                    <>
                      <Button
                        variant="flat"
                        size="sm"
                        className="sm:size-md flex-1 sm:flex-none"
                        startContent={
                          <ExternalLink size={14} className="sm:w-4 sm:h-4" />
                        }
                        onPress={() =>
                          window.open(selectedVideo.videoUrl!, "_blank")
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
                        onPress={() =>
                          handleDownload(
                            selectedVideo.id,
                            `video-${selectedVideo.id}`
                          )
                        }
                      >
                        {tCommon("download")}
                      </Button>
                    </>
                  )}
                <Button
                  variant="light"
                  size="sm"
                  className="sm:size-md"
                  onPress={onClose}
                >
                  {tCommon("close")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
