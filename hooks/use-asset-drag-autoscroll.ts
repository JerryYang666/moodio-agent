"use client";

import { useEffect, useRef } from "react";

export const ASSET_DRAG_MIME = "application/x-moodio-asset";

export function useAssetDragAutoScroll() {
  const isDraggingRef = useRef(false);
  const clientYRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const EDGE = 100;
    const MAX_SPEED = 18;

    const hasAssetType = (e: DragEvent) =>
      e.dataTransfer?.types?.includes(ASSET_DRAG_MIME) ?? false;

    const tick = () => {
      if (!isDraggingRef.current) {
        rafRef.current = null;
        return;
      }
      const y = clientYRef.current;
      const h = window.innerHeight;
      let delta = 0;
      if (y > 0 && y < EDGE) {
        delta = -Math.ceil(((EDGE - y) / EDGE) * MAX_SPEED);
      } else if (y > h - EDGE && y < h) {
        delta = Math.ceil(((y - (h - EDGE)) / EDGE) * MAX_SPEED);
      }
      if (delta !== 0) {
        window.scrollBy(0, delta);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = () => {
      if (isDraggingRef.current) return;
      isDraggingRef.current = true;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const stop = () => {
      isDraggingRef.current = false;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const onDragStart = (e: DragEvent) => {
      if (hasAssetType(e)) start();
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasAssetType(e)) return;
      start();
      clientYRef.current = e.clientY;
    };

    window.addEventListener("dragstart", onDragStart);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);

    return () => {
      window.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
      stop();
    };
  }, []);
}
