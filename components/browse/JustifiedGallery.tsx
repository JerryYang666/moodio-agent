"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { LazyVideo } from "./LazyVideo";
import { Squircle } from "@/components/Squircle";

export interface Photo {
  src: string;
  width: number;
  height: number;
  alt: string;
  key: string;
  id: number;
  videoName: string;
  dimensionsLoaded?: boolean;
  footer?: React.ReactNode;
  footerHeight?: number;
}

export interface JustifiedGalleryProps {
  photos: Photo[];
  targetRowHeight?: number;
  spacing?: number;
  onClick?: (photo: Photo) => void;
  onHeightChange?: (height: number) => void;
  hasMore?: boolean;
}

const getColumnCount = (containerWidth: number): number => {
  if (containerWidth >= 1000) return 4;
  if (containerWidth >= 700) return 3;
  if (containerWidth >= 400) return 2;
  return 1;
};

const distributeIntoColumns = (
  photos: Photo[],
  columnCount: number
): Photo[][] => {
  const columns: Photo[][] = Array.from({ length: columnCount }, () => []);
  const heights = new Float64Array(columnCount);

  for (const photo of photos) {
    let shortest = 0;
    for (let i = 1; i < columnCount; i++) {
      if (heights[i] < heights[shortest]) shortest = i;
    }
    columns[shortest].push(photo);
    heights[shortest] += (photo.height / photo.width) + (photo.footerHeight ?? 0);
  }

  return columns;
};

export const JustifiedGallery: React.FC<JustifiedGalleryProps> = ({
  photos,
  spacing = 6,
  onClick,
  onHeightChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columnCount = containerWidth > 0 ? getColumnCount(containerWidth) : 0;
  const columns = useMemo(
    () => (columnCount > 0 ? distributeIntoColumns(photos, columnCount) : []),
    [photos, columnCount]
  );

  useEffect(() => {
    if (containerRef.current && onHeightChange) {
      onHeightChange(containerRef.current.scrollHeight);
    }
  }, [columns, onHeightChange]);

  return (
    <div
      ref={containerRef}
      className="w-full flex items-start"
      style={{ gap: spacing }}
    >
      {columns.map((column, colIdx) => (
        <div
          key={colIdx}
          className="flex-1 min-w-0 flex flex-col"
          style={{ gap: spacing }}
        >
          {column.map((photo) => (
            <Squircle
              key={photo.key}
              className="flex flex-col"
              data-photo-key={photo.key}
            >
              <LazyVideo
                src={photo.src}
                aspectRatio={photo.width / photo.height}
                onClick={() => onClick?.(photo)}
              />
              {photo.footer && (
                <div style={{ height: photo.footerHeight ?? "auto" }}>
                  {photo.footer}
                </div>
              )}
            </Squircle>
          ))}
        </div>
      ))}
    </div>
  );
};
