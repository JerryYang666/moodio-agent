"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface ImageHoverPreviewProps {
  src: string;
  alt?: string;
  children: React.ReactNode;
  /** Delay in milliseconds before showing the preview (default: 1000ms) */
  delay?: number;
  /** Maximum width of the preview in pixels (default: 400) */
  maxPreviewWidth?: number;
  /** Maximum height of the preview in pixels (default: 400) */
  maxPreviewHeight?: number;
}

export default function ImageHoverPreview({
  src,
  alt = "Image preview",
  children,
  delay = 1000,
  maxPreviewWidth = 500,
  maxPreviewHeight = 500,
}: ImageHoverPreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);

  // Handle client-side mounting for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const calculatePosition = useCallback(() => {
    if (!containerRef.current) return { x: 0, y: 0 };

    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate initial position (to the right of the image by default)
    let x = rect.right + 16;
    let y = rect.top;

    // Check if preview would overflow on the right
    if (x + maxPreviewWidth > viewportWidth - 16) {
      // Position to the left of the image instead
      x = rect.left - maxPreviewWidth - 16;
    }

    // If still overflowing on the left, center it horizontally
    if (x < 16) {
      x = Math.max(16, (viewportWidth - maxPreviewWidth) / 2);
    }

    // Check vertical overflow
    if (y + maxPreviewHeight > viewportHeight - 16) {
      y = viewportHeight - maxPreviewHeight - 16;
    }

    // Ensure y is not negative
    if (y < 16) {
      y = 16;
    }

    return { x, y };
  }, [maxPreviewWidth, maxPreviewHeight]);

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;

    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Set timeout to show preview after delay
    hoverTimeoutRef.current = setTimeout(() => {
      if (isHoveringRef.current) {
        const position = calculatePosition();
        setPreviewPosition(position);
        setShowPreview(true);
      }
    }, delay);
  }, [delay, calculatePosition]);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;

    // Clear the timeout if user leaves before delay completes
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    setShowPreview(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Update position on scroll/resize while preview is shown
  useEffect(() => {
    if (!showPreview) return;

    const updatePosition = () => {
      const position = calculatePosition();
      setPreviewPosition(position);
    };

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showPreview, calculatePosition]);

  const previewContent = (
    <AnimatePresence>
      {showPreview && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed z-9999 pointer-events-none"
          style={{
            left: previewPosition.x,
            top: previewPosition.y,
          }}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl overflow-hidden border border-divider"
            style={{
              maxWidth: maxPreviewWidth,
              maxHeight: maxPreviewHeight,
            }}
          >
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-contain"
              style={{
                maxWidth: maxPreviewWidth,
                maxHeight: maxPreviewHeight,
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="inline-block"
    >
      {children}
      {mounted && createPortal(previewContent, document.body)}
    </div>
  );
}
