"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import { Input } from "@heroui/input";
import { Tabs, Tab } from "@heroui/tabs";
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
  RefreshCw,
  Play,
  Download,
  Clock,
  XCircle,
  Loader2,
  ExternalLink,
  RotateCcw,
  FolderPlus,
  Plus,
  Folder,
  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { VideoGenerationRestore } from "./video-generation-panel";
import VideoStatusChip from "./video-status-chip";
import { getVideoModel } from "@/lib/video/models";
import { useCollections } from "@/hooks/use-collections";
import type { Collection } from "@/components/collections-provider";
import VideoPlayer from "./video-player";

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
  signedVideoUrl: string | null; // Signed URL for frame capture (CORS-compatible)
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

// Collection video now has full VideoGeneration details from the API
interface CollectionVideoGeneration extends VideoGeneration {
  collectionImageId: string;
  collectionId: string;
}

interface CollectionWithVideos extends Collection {
  videos: CollectionVideoGeneration[];
}

type ViewMode = "all" | "by-collection";

const POLL_INTERVAL = 5000; // 5 seconds

// Flying image animation component
interface FlyingImageProps {
  imageUrl: string;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  onComplete: () => void;
  altText: string;
}

const FlyingImage = ({
  imageUrl,
  startPosition,
  endPosition,
  onComplete,
  altText,
}: FlyingImageProps) => {
  return (
    <motion.div
      initial={{
        position: "fixed",
        left: startPosition.x,
        top: startPosition.y,
        width: 100,
        height: 100,
        opacity: 1,
        zIndex: 9999,
      }}
      animate={{
        left: endPosition.x,
        top: endPosition.y,
        width: 40,
        height: 40,
        opacity: 0,
      }}
      transition={{
        duration: 0.7,
        ease: "easeInOut",
      }}
      onAnimationComplete={onComplete}
      className="pointer-events-none rounded-lg overflow-hidden shadow-lg"
    >
      <img
        src={imageUrl}
        alt={altText}
        className="w-full h-full object-cover"
      />
    </motion.div>
  );
};

export default function VideoList({ refreshTrigger, onRestore }: VideoListProps) {
  const t = useTranslations("video");
  const tCommon = useTranslations("common");
  const tCollections = useTranslations("collections");
  const tMenu = useTranslations("imageMenu");
  const [generations, setGenerations] = useState<VideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoGeneration | null>(
    null
  );

  // View mode state (all videos vs by collection)
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [collectionsWithVideos, setCollectionsWithVideos] = useState<CollectionWithVideos[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  // Collection-related state
  const {
    collections,
    createCollection,
    addVideoToCollection,
    getDefaultCollectionName,
  } = useCollections();
  const [flyingImages, setFlyingImages] = useState<
    Array<{ id: string; imageUrl: string; startPos: { x: number; y: number } }>
  >([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingVideoForCollection, setPendingVideoForCollection] =
    useState<VideoGeneration | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onOpenChange: onCreateOpenChange,
  } = useDisclosure();

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

  // Fetch collections with videos when view mode changes to "by-collection"
  const fetchCollectionsWithVideos = useCallback(async () => {
    setCollectionsLoading(true);
    try {
      // Single API call to get all collections with videos
      const res = await fetch("/api/collection/videos");
      if (!res.ok) {
        throw new Error("Failed to fetch collections with videos");
      }

      const data = await res.json();
      setCollectionsWithVideos(data.collections || []);
    } catch (e) {
      console.error("Error fetching collections with videos:", e);
      setCollectionsWithVideos([]);
    } finally {
      setCollectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "by-collection") {
      fetchCollectionsWithVideos();
    }
  }, [viewMode, fetchCollectionsWithVideos]);

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

  // Collection-related handlers
  const getEndPosition = () => {
    if (typeof window === "undefined") return { x: 0, y: 100 };
    return { x: window.innerWidth - 60, y: 100 };
  };

  const startFlyingAnimation = (videoId: string, imageUrl: string) => {
    const cardElement = cardRefs.current.get(videoId);
    if (!cardElement) return;

    const cardRect = cardElement.getBoundingClientRect();
    const startPos = {
      x: cardRect.left + cardRect.width / 2 - 50,
      y: cardRect.top + cardRect.height / 2 - 50,
    };

    const flyingId = `flying-${Date.now()}`;
    setFlyingImages((prev) => [...prev, { id: flyingId, imageUrl, startPos }]);
  };

  const removeFlyingImage = (id: string) => {
    setFlyingImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleAddVideoToCollection = async (
    collectionId: string,
    gen: VideoGeneration
  ) => {
    if (!gen.videoId || !gen.thumbnailImageId) return;

    const success = await addVideoToCollection(
      collectionId,
      gen.thumbnailImageId, // imageId = thumbnail
      gen.videoId, // assetId = video
      {
        title: gen.params.prompt?.slice(0, 50) || t("untitledVideo"),
        prompt: gen.params.prompt || "",
        status: gen.status,
      }
    );

    if (success) {
      startFlyingAnimation(gen.id, gen.thumbnailUrl || gen.sourceImageUrl);
    }
  };

  const handleCreateNewCollection = (gen: VideoGeneration) => {
    setPendingVideoForCollection(gen);
    setNewCollectionName(getDefaultCollectionName());
    onCreateOpen();
  };

  const handleCreateAndAddVideo = async () => {
    if (!newCollectionName.trim() || !pendingVideoForCollection) return;
    if (!pendingVideoForCollection.videoId || !pendingVideoForCollection.thumbnailImageId) return;

    setIsCreating(true);
    try {
      const collection = await createCollection(newCollectionName.trim());
      if (collection) {
        await addVideoToCollection(
          collection.id,
          pendingVideoForCollection.thumbnailImageId,
          pendingVideoForCollection.videoId,
          {
            title:
              pendingVideoForCollection.params.prompt?.slice(0, 50) ||
              t("untitledVideo"),
            prompt: pendingVideoForCollection.params.prompt || "",
            status: pendingVideoForCollection.status,
          }
        );
        startFlyingAnimation(
          pendingVideoForCollection.id,
          pendingVideoForCollection.thumbnailUrl ||
          pendingVideoForCollection.sourceImageUrl
        );
        setNewCollectionName("");
        setPendingVideoForCollection(null);
        onCreateOpenChange();
      }
    } catch (error) {
      console.error("Error creating collection:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const endPos = getEndPosition();

  if (loading) {
    return (
      <Card className="h-full shadow-none">
        <CardBody className="flex items-center justify-center">
          <Spinner />
        </CardBody>
      </Card>
    );
  }

  // Get selected collection data
  const selectedCollection = selectedCollectionId
    ? collectionsWithVideos.find(c => c.id === selectedCollectionId)
    : null;

  return (
    <>
      <Card className="h-full overflow-hidden flex flex-col shadow-none">
        <CardHeader className="flex flex-col gap-2 shrink-0 px-3 sm:px-4 pb-0">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Video size={18} className="text-primary sm:w-5 sm:h-5" />
              <h2 className="text-base sm:text-lg font-semibold">
                {t("yourVideos")}
              </h2>
              {viewMode === "all" && (
                <Chip size="sm" variant="flat">
                  {t("videoCount", { count: generations.length })}
                </Chip>
              )}
            </div>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={viewMode === "all" ? fetchGenerations : fetchCollectionsWithVideos}
            >
              <RefreshCw size={16} />
            </Button>
          </div>

          {/* Tabs for view mode */}
          {!selectedCollectionId && (
            <Tabs
              selectedKey={viewMode}
              onSelectionChange={(key) => setViewMode(key as ViewMode)}
              size="sm"
              variant="underlined"
              classNames={{
                tabList: "gap-4 w-full",
                tab: "px-0",
              }}
            >
              <Tab key="all" title={t("allVideos")} />
              <Tab key="by-collection" title={t("byCollection")} />
            </Tabs>
          )}

          {/* Back button when viewing a collection */}
          {selectedCollectionId && selectedCollection && (
            <div className="flex items-center gap-2 pb-2">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={() => setSelectedCollectionId(null)}
              >
                <ArrowLeft size={16} />
              </Button>
              <Folder size={16} className="text-default-500" />
              <span className="font-medium">{selectedCollection.name}</span>
              <Chip size="sm" variant="flat">
                {t("videoCount", { count: selectedCollection.videos.length })}
              </Chip>
            </div>
          )}
        </CardHeader>

        <CardBody className="overflow-auto pt-2 px-3 sm:px-4 @container">
          {error && (
            <div className="text-xs sm:text-sm text-danger bg-danger-50 p-2 sm:p-3 rounded-lg mb-3 sm:mb-4">
              {error}
            </div>
          )}

          {/* View Mode: All Videos */}
          {viewMode === "all" && (
            <>
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
                <div className="grid grid-cols-2 @3xl:grid-cols-3 gap-2 @sm:gap-4">
                  {generations.map((gen) => (
                    <div
                      key={gen.id}
                      ref={(el) => {
                        if (el) cardRefs.current.set(gen.id, el);
                        else cardRefs.current.delete(gen.id);
                      }}
                      className="relative group"
                    >
                      <button
                        onClick={() => setSelectedVideo(gen)}
                        className="text-left w-full"
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

                      {/* Quick Actions - only for completed videos */}
                      {gen.status === "completed" && gen.videoUrl && (
                        <div className="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10 flex gap-1">
                          {/* Download */}
                          <Button
                            isIconOnly
                            size="sm"
                            variant="solid"
                            className="bg-background/80 backdrop-blur-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(gen.id, `video-${gen.id}`);
                            }}
                          >
                            <Download size={16} />
                          </Button>
                          {/* Put Back */}
                          {onRestore && (
                            <Button
                              isIconOnly
                              size="sm"
                              variant="solid"
                              className="bg-background/80 backdrop-blur-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestore(gen);
                              }}
                            >
                              <RotateCcw size={16} />
                            </Button>
                          )}
                          {/* Add to Collection */}
                          {gen.videoId && gen.thumbnailImageId && (
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
                                    handleCreateNewCollection(gen);
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
                                      .filter(
                                        (c) =>
                                          c.permission === "owner" ||
                                          c.permission === "collaborator"
                                      )
                                      .map((collection) => (
                                        <DropdownItem
                                          key={collection.id}
                                          startContent={<FolderPlus size={16} />}
                                          onPress={() =>
                                            handleAddVideoToCollection(
                                              collection.id,
                                              gen
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
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* View Mode: By Collection - Collections List */}
          {viewMode === "by-collection" && !selectedCollectionId && (
            <>
              {collectionsLoading ? (
                <div className="flex items-center justify-center h-48 sm:h-64">
                  <Spinner />
                </div>
              ) : collectionsWithVideos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 sm:h-64 text-center px-4">
                  <Folder
                    size={40}
                    className="sm:w-12 sm:h-12 text-default-300 mb-3 sm:mb-4"
                  />
                  <p className="text-default-500 text-sm sm:text-base">
                    {t("noCollectionsWithVideos")}
                  </p>
                  <p className="text-xs sm:text-sm text-default-400">
                    {t("addVideosToCollections")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 @3xl:grid-cols-3 gap-2 @sm:gap-4">
                  {collectionsWithVideos.map((collection) => (
                    <button
                      key={collection.id}
                      onClick={() => setSelectedCollectionId(collection.id)}
                      className="text-left w-full"
                    >
                      <div className="rounded-lg overflow-hidden border border-divider bg-default-50 hover:border-primary transition-colors">
                        {/* Thumbnail Grid */}
                        <div className="relative aspect-video bg-default-100">
                          <div className="grid grid-cols-2 gap-0.5 h-full">
                            {collection.videos.slice(0, 4).map((video, idx) => (
                              <div key={video.id} className="relative overflow-hidden">
                                <Image
                                  src={video.thumbnailUrl || video.sourceImageUrl}
                                  alt={t("videoThumbnailAlt")}
                                  radius="none"
                                  classNames={{
                                    wrapper: "w-full h-full !max-w-full",
                                    img: "w-full h-full object-cover",
                                  }}
                                />
                                {/* Video badge on first thumbnail */}
                                {idx === 0 && (
                                  <div className="absolute top-1 left-1 z-10">
                                    <div className="bg-black/70 text-white rounded-full p-1 flex items-center gap-0.5">
                                      <Play size={8} fill="white" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                            {/* Fill empty slots if less than 4 videos */}
                            {collection.videos.length < 4 &&
                              Array(4 - Math.min(collection.videos.length, 4))
                                .fill(0)
                                .map((_, idx) => (
                                  <div
                                    key={`empty-${idx}`}
                                    className="bg-default-200"
                                  />
                                ))}
                          </div>
                        </div>

                        {/* Collection Info */}
                        <div className="p-2 sm:p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Folder size={14} className="text-default-500 shrink-0" />
                            <span className="font-medium text-sm truncate">
                              {collection.name}
                            </span>
                          </div>
                          <p className="text-xs text-default-400">
                            {t("videoCount", { count: collection.videos.length })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* View Mode: By Collection - Selected Collection Videos */}
          {viewMode === "by-collection" && selectedCollectionId && selectedCollection && (
            <div className="grid grid-cols-2 @3xl:grid-cols-3 gap-2 @sm:gap-4">
              {selectedCollection.videos.map((video) => (
                <button
                  key={video.id}
                  onClick={() => setSelectedVideo(video)}
                  className="text-left w-full group"
                >
                  <div className="rounded-lg overflow-hidden border border-divider bg-default-50 hover:border-primary transition-colors">
                    {/* Thumbnail */}
                    <div className="relative aspect-video bg-default-100">
                      <Image
                        src={video.thumbnailUrl || video.sourceImageUrl}
                        alt={t("videoThumbnailAlt")}
                        radius="none"
                        classNames={{
                          wrapper: "w-full h-full !max-w-full",
                          img: "w-full h-full object-cover",
                        }}
                      />

                      {/* Status Overlay */}
                      {video.status !== "completed" && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          {video.status === "processing" && (
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
                          {video.status === "pending" && (
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
                          {video.status === "failed" && (
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
                      {video.status === "completed" && (
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
                        <VideoStatusChip status={video.status} />
                        <span className="text-[10px] sm:text-xs text-default-400 shrink-0">
                          {formatDate(video.createdAt)}
                        </span>
                      </div>
                      <div className="text-[10px] sm:text-xs text-default-400 mb-1">
                        {t("model")}: {getModelLabel(video.modelId)}
                      </div>
                      <p className="text-xs sm:text-sm text-default-600 line-clamp-2">
                        {video.params.prompt || t("noPrompt")}
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
                    <VideoPlayer
                      videoUrl={selectedVideo.videoUrl}
                      signedVideoUrl={selectedVideo.signedVideoUrl}
                      thumbnailUrl={selectedVideo.thumbnailUrl}
                      fallbackImageUrl={selectedVideo.sourceImageUrl}
                      status={selectedVideo.status}
                      videoId={selectedVideo.id}
                    />

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
                      {/* Add to Collection dropdown */}
                      {selectedVideo.videoId && selectedVideo.thumbnailImageId && (
                        <Dropdown>
                          <DropdownTrigger>
                            <Button
                              variant="flat"
                              size="sm"
                              className="sm:size-md flex-1 sm:flex-none"
                              startContent={
                                <FolderPlus size={14} className="sm:w-4 sm:h-4" />
                              }
                            >
                              {tMenu("addToCollection")}
                            </Button>
                          </DropdownTrigger>
                          <DropdownMenu
                            aria-label={t("videoActions")}
                            onAction={(key) => {
                              if (key === "create-new") {
                                handleCreateNewCollection(selectedVideo);
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
                                  .filter(
                                    (c) =>
                                      c.permission === "owner" ||
                                      c.permission === "collaborator"
                                  )
                                  .map((collection) => (
                                    <DropdownItem
                                      key={collection.id}
                                      startContent={<FolderPlus size={16} />}
                                      onPress={() =>
                                        handleAddVideoToCollection(
                                          collection.id,
                                          selectedVideo
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

      {/* Flying Images Animation */}
      <AnimatePresence>
        {flyingImages.map((flying) => (
          <FlyingImage
            key={flying.id}
            imageUrl={flying.imageUrl}
            startPosition={flying.startPos}
            endPosition={endPos}
            onComplete={() => removeFlyingImage(flying.id)}
            altText={t("videoThumbnailAlt")}
          />
        ))}
      </AnimatePresence>

      {/* Create Collection Modal */}
      <Modal isOpen={isCreateOpen} onOpenChange={onCreateOpenChange}>
        <ModalContent>
          {(onClose) => (
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
                <Button variant="light" onPress={onClose}>
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
