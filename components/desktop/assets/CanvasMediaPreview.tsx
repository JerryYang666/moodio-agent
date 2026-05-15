"use client";

import { Modal, ModalContent, ModalBody } from "@heroui/modal";
import { Button } from "@heroui/button";
import { X, ZoomIn, ZoomOut, Undo2 } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { EnrichedDesktopAsset } from "./types";
import type {
  ImageAssetMeta,
  VideoAssetMeta,
  PublicVideoAssetMeta,
  PublicImageAssetMeta,
} from "@/lib/desktop/types";

interface CanvasMediaPreviewProps {
  asset: EnrichedDesktopAsset | null;
  onClose: () => void;
}

/**
 * Full-screen lightbox for canvas images/videos, opened from an asset's
 * expand button. Mirrors the chat image-detail fullscreen styling: black
 * backdrop, pan/zoom for images, native controls for videos.
 */
export default function CanvasMediaPreview({
  asset,
  onClose,
}: CanvasMediaPreviewProps) {
  const isOpen = !!asset;

  const meta = (asset?.metadata ?? {}) as Partial<
    ImageAssetMeta & VideoAssetMeta & PublicVideoAssetMeta & PublicImageAssetMeta
  >;
  const title = meta.title || meta.prompt || "";

  const isVideo =
    asset?.assetType === "video" || asset?.assetType === "public_video";
  const videoSrc = isVideo
    ? asset?.signedVideoUrl || asset?.videoUrl || undefined
    : undefined;
  const imageSrc = asset?.imageUrl || undefined;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="full"
      backdrop="blur"
      hideCloseButton
      classNames={{
        base: "h-[100dvh] max-h-[100dvh] m-0 rounded-none bg-black",
        body: "p-0 h-full",
        wrapper: "overflow-hidden z-[70]",
      }}
    >
      <ModalContent>
        {(close) => (
          <ModalBody>
            <div className="relative w-full h-full bg-black flex items-center justify-center">
              <div className="absolute top-4 right-4 z-50">
                <Button
                  isIconOnly
                  variant="flat"
                  className="bg-black/50 text-white"
                  onPress={close}
                  aria-label="Close preview"
                >
                  <X size={20} />
                </Button>
              </div>

              {isVideo && videoSrc ? (
                <video
                  src={videoSrc}
                  poster={imageSrc}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-full object-contain"
                />
              ) : imageSrc ? (
                <TransformWrapper
                  initialScale={1}
                  minScale={0.5}
                  maxScale={5}
                  centerOnInit
                  key={imageSrc}
                >
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                      <div className="absolute top-4 left-4 z-50 flex gap-2">
                        <Button
                          isIconOnly
                          variant="flat"
                          className="bg-black/50 text-white"
                          onPress={() => zoomIn()}
                          aria-label="Zoom in"
                        >
                          <ZoomIn size={20} />
                        </Button>
                        <Button
                          isIconOnly
                          variant="flat"
                          className="bg-black/50 text-white"
                          onPress={() => zoomOut()}
                          aria-label="Zoom out"
                        >
                          <ZoomOut size={20} />
                        </Button>
                        <Button
                          isIconOnly
                          variant="flat"
                          className="bg-black/50 text-white"
                          onPress={() => resetTransform()}
                          aria-label="Reset zoom"
                        >
                          <Undo2 size={20} />
                        </Button>
                      </div>
                      <TransformComponent
                        wrapperStyle={{ width: "100%", height: "100%" }}
                        contentStyle={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <img
                          src={imageSrc}
                          alt={title || "Preview"}
                          className="object-contain"
                          style={{ maxWidth: "100vw", maxHeight: "100dvh" }}
                        />
                      </TransformComponent>
                    </>
                  )}
                </TransformWrapper>
              ) : (
                <div className="text-white/70 text-sm">
                  Preview unavailable
                </div>
              )}

              {title && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[80vw] truncate bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                  {title}
                </div>
              )}
            </div>
          </ModalBody>
        )}
      </ModalContent>
    </Modal>
  );
}
