"use client";

import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/modal";
import { Button } from "@heroui/button";
import {
  X,
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Undo2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { downloadImage } from "./utils";

interface ImageDetailModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  selectedImage: {
    url: string;
    title: string;
    prompt: string;
    imageId?: string;
    status?: "loading" | "generated" | "error";
  } | null;
  onClose: () => void;
}

export default function ImageDetailModal({
  isOpen,
  onOpenChange,
  selectedImage,
  onClose,
}: ImageDetailModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

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
                                    selectedImage.title
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
                            <TransformComponent
                              wrapperClass="w-full h-full"
                              contentClass="w-full h-full flex items-center justify-center"
                            >
                              <img
                                src={selectedImage.url}
                                alt={selectedImage.title}
                                className="max-w-none max-h-none object-contain"
                                style={{
                                  width: "auto",
                                  height: "auto",
                                  maxWidth: "100%",
                                  maxHeight: "100%",
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
                        {selectedImage.status === "error" ? (
                          <div className="w-full h-full flex items-center justify-center bg-danger-50 text-danger rounded-lg min-h-[200px]">
                            <X size={48} />
                          </div>
                        ) : (
                          <div className="relative w-full h-full flex items-center justify-center">
                            <img
                              src={selectedImage.url}
                              alt={selectedImage.title}
                              className="max-w-full max-h-[40vh] md:max-h-[60vh] object-contain rounded-lg cursor-zoom-in"
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
                                    selectedImage.title
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
                            Prompt:
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
