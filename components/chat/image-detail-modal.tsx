"use client";

import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
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
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { downloadImage } from "./utils";

export interface ImageInfo {
  url: string;
  title: string;
  prompt: string;
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
}

export default function ImageDetailModal({
  isOpen,
  onOpenChange,
  selectedImage,
  allImages,
  currentIndex,
  onNavigate,
  onClose,
}: ImageDetailModalProps) {
  const t = useTranslations("imageDetail");
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Reset fullscreen when modal closes
  useEffect(() => {
    if (!isOpen) setIsFullscreen(false);
  }, [isOpen]);

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
            {!isFullscreen && (
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
                                    selectedImage.title,
                                    selectedImage.url
                                  )
                                }
                              >
                                <Download size={20} />
                              </Button>
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
                      <div className="w-full md:w-1/2 flex items-center justify-center bg-black/5 rounded-lg min-h-[200px] md:min-h-[400px] relative group">
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
                                    selectedImage.title,
                                    selectedImage.url
                                  )
                                }
                              >
                                <Download size={16} />
                              </Button>
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
                    </>
                  )}
                </div>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
