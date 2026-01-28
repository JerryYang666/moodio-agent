"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Eraser, Check } from "lucide-react";

interface ImageDrawingModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageId: string;
  imageTitle?: string;
  onSaveMarkedImage: (file: File, originalImageId: string) => Promise<void>;
}

const PEN_COLOR = "#FF0000";
const PEN_WIDTH = 6;

export default function ImageDrawingModal({
  isOpen,
  onClose,
  imageUrl,
  imageId,
  imageTitle,
  onSaveMarkedImage,
}: ImageDrawingModalProps) {
  const t = useTranslations("chat");
  const tCommon = useTranslations("common");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Track the last point for smooth drawing
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Handle image load - just mark as loaded, canvas will be initialized in effect
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  // Initialize canvas after image is loaded and canvas is rendered
  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;

    if (!canvas || !image) return;

    // Get the displayed size of the image
    const rect = image.getBoundingClientRect();
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    // Set canvas to match displayed image size
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    setCanvasSize({ width: displayWidth, height: displayHeight });

    // Configure canvas context
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = PEN_COLOR;
      ctx.lineWidth = PEN_WIDTH;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setHasDrawing(false);
      setImageLoaded(false);
      setCanvasSize({ width: 0, height: 0 });
      lastPointRef.current = null;
    }
  }, [isOpen]);

  // Initialize canvas after imageLoaded becomes true (canvas is now rendered)
  useEffect(() => {
    if (imageLoaded) {
      // Use requestAnimationFrame to ensure the canvas is in the DOM
      requestAnimationFrame(() => {
        initializeCanvas();
      });
    }
  }, [imageLoaded, initializeCanvas]);

  // Handle window resize
  useEffect(() => {
    if (!isOpen || !imageLoaded) return;

    const handleResize = () => {
      // Re-initialize canvas on resize (this will clear the drawing)
      initializeCanvas();
      setHasDrawing(false);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, imageLoaded, initializeCanvas]);

  // Get canvas coordinates from mouse/touch event
  const getCanvasCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  // Start drawing
  const handlePointerDown = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    const point = getCanvasCoordinates(e);
    if (!point) return;

    setIsDrawing(true);
    lastPointRef.current = point;

    // Draw a dot at the starting point
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, PEN_WIDTH / 2, 0, Math.PI * 2);
      ctx.fillStyle = PEN_COLOR;
      ctx.fill();
      setHasDrawing(true);
    }
  };

  // Continue drawing
  const handlePointerMove = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    e.preventDefault();

    const point = getCanvasCoordinates(e);
    if (!point || !lastPointRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;
      setHasDrawing(true);
    }
  };

  // Stop drawing
  const handlePointerUp = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  // Clear the canvas
  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawing(false);
    }
  };

  // Save the marked image
  const handleSave = async () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !hasDrawing) return;

    setIsSaving(true);

    try {
      // Fetch the image through our proxy API to avoid tainted canvas issues
      // Direct fetch to CloudFront fails CORS, but our proxy endpoint works
      // because server-side fetches don't have CORS restrictions
      const proxyUrl = `/api/image/proxy?imageId=${encodeURIComponent(imageId)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const imageBlob = await response.blob();

      // Create an image from the blob that we can draw on canvas
      // Blob URLs are same-origin, so they don't taint the canvas
      const cleanImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(imageBlob);
      });

      // Create a new canvas to combine image and drawing at original resolution
      const outputCanvas = document.createElement("canvas");
      const outputCtx = outputCanvas.getContext("2d");
      if (!outputCtx) throw new Error("Failed to get output canvas context");

      // Use the natural (original) image dimensions for high quality output
      outputCanvas.width = cleanImage.naturalWidth;
      outputCanvas.height = cleanImage.naturalHeight;

      // Draw the original image
      outputCtx.drawImage(cleanImage, 0, 0);

      // Clean up the blob URL
      URL.revokeObjectURL(cleanImage.src);

      // Scale and draw the canvas drawing on top
      // We need to scale from displayed size to original size
      const scaleX = cleanImage.naturalWidth / canvasSize.width;
      const scaleY = cleanImage.naturalHeight / canvasSize.height;

      outputCtx.save();
      outputCtx.scale(scaleX, scaleY);
      outputCtx.drawImage(canvas, 0, 0);
      outputCtx.restore();

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        outputCanvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to create blob"));
          },
          "image/png",
          1.0
        );
      });

      // Create File object
      const fileName = `marked_${imageTitle || "image"}_${Date.now()}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      // Call the save handler
      await onSaveMarkedImage(file, imageId);
      onClose();
    } catch (error) {
      console.error("Failed to save marked image:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="4xl"
      scrollBehavior="inside"
      classNames={{
        base: "max-h-[90vh]",
        body: "p-0",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span>{t("markForChange")}</span>
          <span className="text-sm font-normal text-default-500">
            {t("drawingInstructions")}
          </span>
        </ModalHeader>

        <ModalBody>
          <div
            ref={containerRef}
            className="relative flex items-center justify-center bg-black/5 dark:bg-white/5 min-h-[300px] max-h-[60vh] overflow-hidden"
          >
            {/* Original image */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt={imageTitle || "Image to mark"}
              className="max-w-full max-h-[60vh] object-contain select-none"
              onLoad={handleImageLoad}
              draggable={false}
            />

            {/* Drawing canvas overlay */}
            {imageLoaded && (
              <canvas
                ref={canvasRef}
                className="absolute cursor-crosshair touch-none"
                style={{
                  width: canvasSize.width,
                  height: canvasSize.height,
                }}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              />
            )}

            {/* Loading indicator */}
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner size="lg" />
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter className="flex justify-between">
          <Button
            variant="flat"
            onPress={handleClear}
            isDisabled={!hasDrawing || isSaving}
            startContent={<Eraser size={18} />}
          >
            {t("clearDrawing")}
          </Button>

          <div className="flex gap-2">
            <Button variant="flat" onPress={onClose} isDisabled={isSaving}>
              {tCommon("cancel")}
            </Button>
            <Button
              color="primary"
              onPress={handleSave}
              isDisabled={!hasDrawing || isSaving}
              isLoading={isSaving}
              startContent={!isSaving && <Check size={18} />}
            >
              {t("saveMarkedImage")}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
