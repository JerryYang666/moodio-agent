"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import { Input } from "@heroui/input";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/dropdown";
import {
  X,
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Undo2,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  FolderPlus,
  Plus,
  Video,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useRouter } from "next/navigation";
import { useCollections } from "@/hooks/use-collections";
import { motion, AnimatePresence } from "framer-motion";
import { downloadImage } from "./utils";

export interface ImageInfo {
  url: string;
  title?: string;
  prompt?: string;
  imageId?: string;
  status?: "loading" | "generated" | "error";
}

interface ImageDetailModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  selectedImage: ImageInfo | null;
  allImages: ImageInfo[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
  chatId?: string;
}

// Flying image animation component (same as ImageWithMenu)
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

export default function ImageDetailModal({
  isOpen,
  onOpenChange,
  selectedImage,
  allImages,
  currentIndex,
  onNavigate,
  onClose,
  chatId,
}: ImageDetailModalProps) {
  const t = useTranslations("imageDetail");
  const tMenu = useTranslations("imageMenu");
  const tCollections = useTranslations("collections");
  const tCommon = useTranslations("common");
  const tVideo = useTranslations("video");
  const router = useRouter();
  const {
    collections,
    createCollection,
    addImageToCollection,
    getDefaultCollectionName,
  } = useCollections();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [flyingImages, setFlyingImages] = useState<
    Array<{ id: string; startPos: { x: number; y: number } }>
  >([]);

  // Create collection modal state
  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onOpenChange: onCreateOpenChange,
  } = useDisclosure();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const canNavigatePrev = currentIndex > 0;
  const canNavigateNext = currentIndex < allImages.length - 1;

  const handlePrevious = useCallback(() => {
    if (canNavigatePrev) {
      onNavigate(currentIndex - 1);
    }
  }, [canNavigatePrev, currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (canNavigateNext) {
      onNavigate(currentIndex + 1);
    }
  }, [canNavigateNext, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrevious, handleNext]);

  const hasPrompt = !!selectedImage?.prompt?.trim();

  // Collection menu handlers - simplified animation to fly to right side of screen
  const startFlyingAnimation = () => {
    if (typeof window === "undefined") return;

    const startPos = {
      x: window.innerWidth / 2 - 50,
      y: window.innerHeight / 2 - 50,
    };

    const flyingId = `flying-${Date.now()}`;
    setFlyingImages((prev) => [...prev, { id: flyingId, startPos }]);
  };

  // Simple end position: right side of screen
  const getEndPosition = () => {
    if (typeof window === "undefined") return { x: 0, y: 100 };
    return { x: window.innerWidth - 60, y: 100 };
  };

  const handleAddToCollection = async (collectionId: string) => {
    if (!selectedImage?.imageId) return;

    const success = await addImageToCollection(
      collectionId,
      selectedImage.imageId,
      chatId || null,
      {
        title: selectedImage.title || "",
        prompt: selectedImage.prompt || "",
        status: selectedImage.status || "generated",
      }
    );

    if (success) {
      startFlyingAnimation();
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newCollectionName.trim() || !selectedImage?.imageId) return;

    setIsCreating(true);
    try {
      const collection = await createCollection(newCollectionName.trim());
      if (collection) {
        await addImageToCollection(
          collection.id,
          selectedImage.imageId,
          chatId || null,
          {
            title: selectedImage.title || "",
            prompt: selectedImage.prompt || "",
            status: selectedImage.status || "generated",
          }
        );
        setNewCollectionName("");
        onCreateOpenChange();
        startFlyingAnimation();
      }
    } catch (error) {
      console.error("Error creating collection:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateNewCollection = () => {
    setNewCollectionName(getDefaultCollectionName());
    onCreateOpen();
  };

  const handleGenerateVideo = () => {
    if (selectedImage?.imageId) {
      router.push(`/storyboard?imageId=${selectedImage.imageId}`);
    }
  };

  const removeFlyingImage = (id: string) => {
    setFlyingImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Check if the current image can be added to collection (has imageId and is generated)
  const canAddToCollection =
    selectedImage?.imageId && selectedImage?.status === "generated";

  // Reset fullscreen when modal closes
  useEffect(() => {
    if (!isOpen) setIsFullscreen(false);
  }, [isOpen]);

  // Auto-enter fullscreen for images without prompts (user uploads)
  useEffect(() => {
    if (isOpen && !hasPrompt) {
      setIsFullscreen(true);
    }
  }, [isOpen, hasPrompt]);

  const handleClose = () => {
    setIsFullscreen(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size={isFullscreen ? "full" : "5xl"}
      backdrop="blur"
      scrollBehavior="inside"
      hideCloseButton={isFullscreen}
      classNames={{
        base: isFullscreen
          ? "h-[100dvh] max-h-[100dvh] m-0 rounded-none"
          : "max-h-[90vh]",
        body: isFullscreen ? "p-0 h-full" : "",
        wrapper: isFullscreen ? "overflow-hidden" : "",
      }}
      onClose={handleClose}
    >
      <ModalContent>
        {(onClose) => (
          <>
            {!isFullscreen && selectedImage?.title && (
              <ModalHeader className="flex flex-col gap-1">
                {selectedImage?.title}
              </ModalHeader>
            )}
            <ModalBody>
              {selectedImage && (
                <div
                  className={
                    isFullscreen
                      ? "h-full w-full bg-black flex flex-col"
                      : "flex flex-col md:flex-row gap-6 md:h-full"
                  }
                >
                  {isFullscreen ? (
                    <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
                      <TransformWrapper
                        initialScale={1}
                        minScale={0.5}
                        maxScale={4}
                        centerOnInit
                        key={selectedImage.url}
                      >
                        {({ zoomIn, zoomOut, resetTransform }) => (
                          <>
                            <div className="absolute top-4 right-4 z-50 flex gap-2">
                              <Button
                                isIconOnly
                                variant="flat"
                                className="bg-black/50 text-white"
                                onPress={() => zoomIn()}
                              >
                                <ZoomIn size={20} />
                              </Button>
                              <Button
                                isIconOnly
                                variant="flat"
                                className="bg-black/50 text-white"
                                onPress={() => zoomOut()}
                              >
                                <ZoomOut size={20} />
                              </Button>
                              <Button
                                isIconOnly
                                variant="flat"
                                className="bg-black/50 text-white"
                                onPress={() => resetTransform()}
                              >
                                <Undo2 size={20} />
                              </Button>
                              <Button
                                isIconOnly
                                variant="flat"
                                className="bg-black/50 text-white"
                                onPress={() =>
                                  downloadImage(
                                    selectedImage.imageId,
                                    selectedImage.title || "image",
                                    selectedImage.url
                                  )
                                }
                              >
                                <Download size={20} />
                              </Button>
                              {/* Collection menu dropdown */}
                              {canAddToCollection && (
                                <Dropdown
                                  isOpen={isMenuOpen}
                                  onOpenChange={setIsMenuOpen}
                                >
                                  <DropdownTrigger>
                                    <Button
                                      isIconOnly
                                      variant="flat"
                                      className="bg-black/50 text-white"
                                    >
                                      <MoreVertical size={20} />
                                    </Button>
                                  </DropdownTrigger>
                                  <DropdownMenu
                                    aria-label={tMenu("actionsLabel")}
                                    onAction={(key) => {
                                      if (key === "generate-video") {
                                        handleGenerateVideo();
                                      } else if (key === "create-new") {
                                        handleCreateNewCollection();
                                      }
                                    }}
                                  >
                                    <DropdownItem
                                      key="generate-video"
                                      startContent={<Video size={16} />}
                                      className="text-primary"
                                    >
                                      {tVideo("generateVideo")}
                                    </DropdownItem>
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
                                        <DropdownItem
                                          key="no-collections"
                                          isReadOnly
                                        >
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
                                              startContent={
                                                <FolderPlus size={16} />
                                              }
                                              onPress={() =>
                                                handleAddToCollection(
                                                  collection.id
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
                                isIconOnly
                                variant="flat"
                                className="bg-black/50 text-white"
                                onPress={() => setIsFullscreen(false)}
                              >
                                <Minimize2 size={20} />
                              </Button>
                              <Button
                                isIconOnly
                                variant="flat"
                                className="bg-black/50 text-white"
                                onPress={onClose}
                              >
                                <X size={20} />
                              </Button>
                            </div>

                            {/* Navigation arrows in fullscreen */}
                            {canNavigatePrev && (
                              <Button
                                isIconOnly
                                variant="flat"
                                className="absolute left-4 top-1/2 -translate-y-1/2 z-50 bg-black/50 text-white w-12 h-12"
                                onPress={handlePrevious}
                              >
                                <ChevronLeft size={28} />
                              </Button>
                            )}
                            {canNavigateNext && (
                              <Button
                                isIconOnly
                                variant="flat"
                                className="absolute right-4 top-1/2 -translate-y-1/2 z-50 bg-black/50 text-white w-12 h-12"
                                onPress={handleNext}
                              >
                                <ChevronRight size={28} />
                              </Button>
                            )}

                            {/* Image counter */}
                            {allImages.length > 1 && (
                              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                                {currentIndex + 1} / {allImages.length}
                              </div>
                            )}

                            <TransformComponent
                              wrapperStyle={{
                                width: "100%",
                                height: "100%",
                              }}
                              contentStyle={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <img
                                src={selectedImage.url}
                                alt={selectedImage.title}
                                className="object-contain"
                                style={{
                                  maxWidth: "100vw",
                                  maxHeight: "100dvh",
                                }}
                              />
                            </TransformComponent>
                          </>
                        )}
                      </TransformWrapper>
                    </div>
                  ) : (
                    <>
                      <div
                        className={
                          hasPrompt
                            ? "w-full md:w-1/2 flex items-center justify-center bg-black/5 rounded-lg min-h-[200px] md:min-h-[400px] relative group"
                            : "w-full flex items-center justify-center bg-black/5 rounded-lg min-h-[200px] md:min-h-[400px] relative group"
                        }
                      >
                        {/* Navigation arrows */}
                        {canNavigatePrev && (
                          <Button
                            isIconOnly
                            variant="flat"
                            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/50 text-white md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                            onPress={handlePrevious}
                          >
                            <ChevronLeft size={24} />
                          </Button>
                        )}
                        {canNavigateNext && (
                          <Button
                            isIconOnly
                            variant="flat"
                            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/50 text-white md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                            onPress={handleNext}
                          >
                            <ChevronRight size={24} />
                          </Button>
                        )}

                        {/* Image counter */}
                        {allImages.length > 1 && (
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 bg-black/50 text-white px-2 py-0.5 rounded-full text-xs">
                            {currentIndex + 1} / {allImages.length}
                          </div>
                        )}

                        {selectedImage.status === "error" ? (
                          <div className="w-full h-full flex items-center justify-center bg-danger-50 text-danger rounded-lg min-h-[200px]">
                            <X size={48} />
                          </div>
                        ) : (
                          <div className="relative w-full h-full flex items-center justify-center">
                            <Image
                              src={selectedImage.url}
                              alt={selectedImage.title}
                              classNames={{
                                wrapper: "cursor-zoom-in",
                                img: "max-w-full max-h-[40vh] md:max-h-[60vh] object-contain rounded-lg",
                              }}
                              onClick={() => setIsFullscreen(true)}
                              onDoubleClick={() => setIsFullscreen(true)}
                            />
                            <div className="absolute top-2 right-2 z-10 flex gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <Button
                                isIconOnly
                                variant="flat"
                                className="bg-black/50 text-white"
                                onPress={() =>
                                  downloadImage(
                                    selectedImage.imageId,
                                    selectedImage.title || "image",
                                    selectedImage.url
                                  )
                                }
                              >
                                <Download size={16} />
                              </Button>
                              {/* Collection menu dropdown */}
                              {canAddToCollection && (
                                <Dropdown
                                  isOpen={isMenuOpen}
                                  onOpenChange={setIsMenuOpen}
                                >
                                  <DropdownTrigger>
                                    <Button
                                      isIconOnly
                                      variant="flat"
                                      className="bg-black/50 text-white"
                                    >
                                      <MoreVertical size={16} />
                                    </Button>
                                  </DropdownTrigger>
                                  <DropdownMenu
                                    aria-label={tMenu("actionsLabel")}
                                    onAction={(key) => {
                                      if (key === "generate-video") {
                                        handleGenerateVideo();
                                      } else if (key === "create-new") {
                                        handleCreateNewCollection();
                                      }
                                    }}
                                  >
                                    <DropdownItem
                                      key="generate-video"
                                      startContent={<Video size={16} />}
                                      className="text-primary"
                                    >
                                      {tVideo("generateVideo")}
                                    </DropdownItem>
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
                                        <DropdownItem
                                          key="no-collections"
                                          isReadOnly
                                        >
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
                                              startContent={
                                                <FolderPlus size={16} />
                                              }
                                              onPress={() =>
                                                handleAddToCollection(
                                                  collection.id
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
                                isIconOnly
                                variant="flat"
                                className="bg-black/50 text-white"
                                onPress={() => setIsFullscreen(true)}
                              >
                                <Maximize2 size={16} />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      {hasPrompt && (
                        <div className="w-full md:w-1/2 flex flex-col">
                          <div className="bg-default-100 p-4 rounded-lg text-sm md:flex-1 md:overflow-y-auto">
                            <p className="font-semibold mb-2 text-base">
                              {t("promptLabel")}
                            </p>
                            <p className="text-default-600 leading-relaxed whitespace-pre-wrap">
                              {selectedImage.prompt}
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>

      {/* Flying Images Animation */}
      <AnimatePresence>
        {flyingImages.map((flying) => (
          <FlyingImage
            key={flying.id}
            imageUrl={selectedImage?.url || ""}
            startPosition={flying.startPos}
            endPosition={getEndPosition()}
            onComplete={() => removeFlyingImage(flying.id)}
            altText={tMenu("flyingImageAlt")}
          />
        ))}
      </AnimatePresence>

      {/* Create Collection Modal */}
      <Modal isOpen={isCreateOpen} onOpenChange={onCreateOpenChange}>
        <ModalContent>
          {(onCloseCreate) => (
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
                <Button variant="light" onPress={onCloseCreate}>
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
    </Modal>
  );
}
