"use client";

import React, { useRef, useLayoutEffect, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Input } from "@heroui/input";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/dropdown";
import { addToast } from "@heroui/toast";
import {
  GraduationCap,
  Search,
  Wand2,
  ArrowLeft,
  FolderPlus,
  LayoutDashboard,
  Plus,
} from "lucide-react";
import { JustifiedGallery, type Photo } from "./JustifiedGallery";
import { Squircle } from "@/components/Squircle";
import { VideoVisibilityProvider } from "@/hooks/use-video-visibility";
import { MOCK_VIDEO_DETAIL, type VideoDetailData } from "./video-detail-data";
import { useGetVideoDetailQuery, type ContentLabel } from "@/lib/redux/services/api";
import { getVideoUrl as getBrowseVideoUrl } from "@/lib/config/video.config";
import { useCollections } from "@/hooks/use-collections";
import { useFeatureFlag } from "@/lib/feature-flags";
import { hasWriteAccess } from "@/lib/permissions";
import SendToDesktopModal from "@/components/desktop/SendToDesktopModal";

const ACTION_ICONS = {
  learn: GraduationCap,
  explore: Search,
  create: Wand2,
  collection: FolderPlus,
  desktop: LayoutDashboard,
} as const;

const ACTION_PROMPTS: Record<string, string> = {
  learn: "Explain what filming techniques are used in this video and break down the key creative decisions.",
  explore: "Analyze this video first, then find similar or related videos using the search tool.",
  create: "Analyze this video and help me create a similar one with the same style and techniques.",
};

function groupLabelsByProperty(labels: ContentLabel[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const label of labels) {
    const path = label.property_path;
    if (!path) {
      (groups["Other"] ??= []).push(label.value);
      continue;
    }
    const segments = path.split(".");
    const groupKey = segments.slice(-2).join(" > ");
    (groups[groupKey] ??= []).push(label.value);
  }
  return groups;
}

interface MetadataItemProps {
  label: string;
  value: string;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-default-400 dark:text-default-500">
        {label}
      </span>
      <span className="block text-[13px] text-default-700 dark:text-default-600 leading-snug">
        {value}
      </span>
    </div>
  );
}

interface VideoDetailViewProps {
  selectedPhoto: Photo;
  similarPhotos: Photo[];
  onClose: () => void;
  onTargetReady: (rect: DOMRect) => void;
  videoVisible: boolean;
  desktopId?: string;
}

export function VideoDetailView({
  selectedPhoto,
  similarPhotos,
  onClose,
  onTargetReady,
  videoVisible,
  desktopId,
}: VideoDetailViewProps) {
  const detail: VideoDetailData = MOCK_VIDEO_DETAIL;
  const videoTargetRef = useRef<HTMLDivElement>(null);
  const { data: videoDetail, isLoading: isLoadingDetail } = useGetVideoDetailQuery(selectedPhoto.id);

  const showDesktop = useFeatureFlag<boolean>("user_desktop") ?? false;
  const {
    collections,
    addPublicVideoToCollection,
    createCollection,
    getDefaultCollectionName,
  } = useCollections();

  const {
    isOpen: isCreateCollectionOpen,
    onOpen: onCreateCollectionOpen,
    onOpenChange: onCreateCollectionOpenChange,
  } = useDisclosure();

  const {
    isOpen: isDesktopOpen,
    onOpen: onDesktopOpen,
    onOpenChange: onDesktopOpenChange,
  } = useDisclosure();

  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const groupedLabels = useMemo(() => {
    if (!videoDetail?.labels) return {};
    return groupLabelsByProperty(videoDetail.labels);
  }, [videoDetail?.labels]);

  const labelEntries = useMemo(() => Object.entries(groupedLabels), [groupedLabels]);

  const chatActions = useMemo(
    () => detail.actions.filter((a) => a.icon !== "collection" && a.icon !== "desktop"),
    [detail.actions]
  );

  useLayoutEffect(() => {
    if (videoTargetRef.current) {
      onTargetReady(videoTargetRef.current.getBoundingClientRect());
    }
  }, [onTargetReady]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const videoTitle = videoDetail?.content_uuid ?? selectedPhoto.videoName ?? "Untitled";
  const storageKey = videoDetail?.storage_key ?? "";
  const contentUuid = videoDetail?.content_uuid ?? "";

  const handleAddToCollection = async (collectionId: string) => {
    if (!storageKey || !contentUuid) return;
    const success = await addPublicVideoToCollection(
      collectionId,
      storageKey,
      contentUuid,
      videoTitle
    );
    if (success) {
      addToast({
        title: "Added to collection",
        description: "Video has been added to the collection",
        color: "success",
      });
    } else {
      addToast({
        title: "Error",
        description: "Failed to add video to collection",
        color: "danger",
      });
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newCollectionName.trim() || !storageKey || !contentUuid) return;
    setIsCreating(true);
    try {
      const collection = await createCollection(newCollectionName.trim());
      if (collection) {
        const success = await addPublicVideoToCollection(
          collection.id,
          storageKey,
          contentUuid,
          videoTitle
        );
        if (success) {
          addToast({
            title: "Added to collection",
            description: `Video added to "${collection.name}"`,
            color: "success",
          });
        }
        setNewCollectionName("");
        onCreateCollectionOpenChange();
      }
    } catch (error) {
      console.error("Error creating collection:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const writableCollections = collections.filter((c) => hasWriteAccess(c.permission));

  return (
    <div className="w-full">
      {/* Back button */}
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 text-sm text-default-500 hover:text-default-700 dark:text-default-500 dark:hover:text-default-700 transition-colors mb-4"
      >
        <ArrowLeft size={16} />
        <span>Back to results</span>
      </button>

      {/* Top section: Video + Info side by side */}
      <div className="flex flex-col lg:flex-row gap-6 mb-6">
        {/* Video player area */}
        <div className="lg:w-[55%] shrink-0">
          <Squircle
            ref={videoTargetRef}
            className="relative overflow-hidden"
            style={{
              aspectRatio: `${selectedPhoto.width} / ${selectedPhoto.height}`,
            }}
          >
            <div className={`w-full h-full ${videoVisible ? "visible" : "invisible"}`}>
              <video
                src={selectedPhoto.src}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            </div>

            <motion.div
              className="absolute top-3 right-3 flex gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.2 }}
            >
              <Dropdown>
                <DropdownTrigger>
                  <button
                    className="p-2 rounded-md bg-black/50 hover:bg-black/70 transition-colors disabled:opacity-50"
                    disabled={!videoDetail || isLoadingDetail}
                  >
                    <FolderPlus size={16} className="text-white" />
                  </button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="Add to collection"
                  onAction={(key) => {
                    if (key === "create-new") {
                      setNewCollectionName(getDefaultCollectionName());
                      onCreateCollectionOpen();
                    }
                  }}
                >
                  <DropdownSection title="Add to Collection" showDivider>
                    <DropdownItem
                      key="create-new"
                      startContent={<Plus size={16} />}
                      className="font-semibold"
                    >
                      Create new collection
                    </DropdownItem>
                  </DropdownSection>
                  <DropdownSection
                    title={writableCollections.length > 0 ? "Your Collections" : undefined}
                  >
                    {writableCollections.length === 0 ? (
                      <DropdownItem key="no-collections" isReadOnly>
                        <span className="text-xs text-default-400">
                          No collections yet
                        </span>
                      </DropdownItem>
                    ) : (
                      writableCollections.map((collection) => (
                        <DropdownItem
                          key={collection.id}
                          startContent={<FolderPlus size={16} />}
                          onPress={() => handleAddToCollection(collection.id)}
                        >
                          {collection.name}
                        </DropdownItem>
                      ))
                    )}
                  </DropdownSection>
                </DropdownMenu>
              </Dropdown>

              {showDesktop && (
                <button
                  className="p-2 rounded-md bg-black/50 hover:bg-black/70 transition-colors disabled:opacity-50"
                  disabled={!videoDetail || isLoadingDetail}
                  onClick={onDesktopOpen}
                >
                  <LayoutDashboard size={16} className="text-white" />
                </button>
              )}
            </motion.div>
          </Squircle>
        </div>

        {/* Info panel */}
        <motion.div
          className="flex-1 min-w-0"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <h2 className="text-xl font-bold text-foreground mb-0.5">{detail.title}</h2>
          <p className="text-sm text-default-400 dark:text-default-500 mb-4">{detail.source}</p>

          {/* Chat-based actions */}
          <div className="flex flex-col gap-2 mb-5">
            {chatActions.map((action) => {
              const Icon = ACTION_ICONS[action.icon];
              return (
                <Button
                  key={action.label}
                  variant="bordered"
                  className="justify-center gap-3 items-center border-default-300 dark:border-default-500 text-default-700 dark:text-default-600 hover:bg-default-100 dark:hover:bg-white/10 w-full"
                  startContent={<Icon size={18} />}
                  isDisabled={!videoDetail || isLoadingDetail}
                  onPress={videoDetail ? () => {
                    window.dispatchEvent(new CustomEvent("learn-from-video", {
                      detail: {
                        contentId: videoDetail.id,
                        storageKey: videoDetail.storage_key,
                        videoUrl: getBrowseVideoUrl(videoDetail.storage_key),
                        prompt: ACTION_PROMPTS[action.icon],
                      },
                    }));
                  } : undefined}
                >
                  {action.label}
                </Button>
              );
            })}
          </div>

          <div className="mb-1">
            <span className="text-xs text-default-400 dark:text-default-500">Topics to ask agent:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {detail.topics.map((topic) => (
              <Chip
                key={topic.label}
                size="sm"
                variant="bordered"
                className="border-default-300 dark:border-default-500 text-default-600 dark:text-default-600 text-[11px] cursor-pointer hover:bg-default-100 dark:hover:bg-white/10"
              >
                &ldquo;{topic.label}&rdquo;
              </Chip>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Metadata section */}
      <motion.div
        className="mb-8 px-1 max-h-[320px] overflow-y-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        {isLoadingDetail ? (
          <div className="text-sm text-default-400">Loading metadata…</div>
        ) : labelEntries.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-1">
            {labelEntries.map(([group, values]) => (
              <MetadataItem key={group} label={group} value={values.join(", ")} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-default-400">No labels available</div>
        )}
      </motion.div>

      {/* Similar Shots */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        <h3 className="text-sm font-semibold uppercase tracking-widest text-default-400 dark:text-default-500 mb-4">
          Similar Shots
        </h3>
        <VideoVisibilityProvider>
          <JustifiedGallery
            photos={similarPhotos}
            targetRowHeight={140}
            spacing={4}
          />
        </VideoVisibilityProvider>
      </motion.div>

      {/* Create Collection Modal */}
      <Modal isOpen={isCreateCollectionOpen} onOpenChange={onCreateCollectionOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Create New Collection</ModalHeader>
              <ModalBody>
                <Input
                  label="Collection name"
                  placeholder="Enter collection name"
                  value={newCollectionName}
                  onValueChange={setNewCollectionName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateAndAdd();
                  }}
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleCreateAndAdd}
                  isLoading={isCreating}
                  isDisabled={!newCollectionName.trim()}
                >
                  Create & Add
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Send to Desktop Modal */}
      <SendToDesktopModal
        isOpen={isDesktopOpen}
        onOpenChange={onDesktopOpenChange}
        desktopId={desktopId}
        assets={videoDetail ? [
          {
            assetType: "public_video" as const,
            metadata: {
              storageKey: videoDetail.storage_key,
              contentUuid: videoDetail.content_uuid,
              title: videoTitle,
              width: selectedPhoto.width,
              height: selectedPhoto.height,
            },
          },
        ] : []}
      />
    </div>
  );
}
