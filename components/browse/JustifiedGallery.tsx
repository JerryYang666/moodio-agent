"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LazyVideo } from "./LazyVideo";

export interface Photo {
  src: string;
  width: number;
  height: number;
  alt: string;
  key: string;
  id: number;
  videoName: string;
  dimensionsLoaded?: boolean; // Optional: true if actual dimensions loaded
  footer?: React.ReactNode; // Optional footer rendered below the video
  footerHeight?: number; // Height of the footer in pixels (default 0)
}

interface RowData {
  photos: Photo[];
  rowHeight: number; // Media-only height
  footerHeight: number; // Max footer height across photos in this row
}

interface AnchorInfo {
  videoIndex: number;
  offsetFromRowTop: number;
}

// Helper: Find the scroll container (parent with overflow-y: auto/scroll)
const findScrollContainer = (element: HTMLElement | null): HTMLElement | null => {
  let current = element?.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

// Helper: Get the anchor video at a given scroll position
// Strategy: Find the video whose row is most prominent in the viewport
// We anchor on the first video of the row that's closest to the viewport top
// Using offset=0 prevents drift across resize cycles
const getAnchorAtScroll = (
  scrollTop: number,
  rows: RowData[],
  spacing: number
): AnchorInfo => {
  let cumulativeHeight = 0;
  let videoIndex = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowHeight = row.rowHeight + row.footerHeight + spacing;
    const rowTop = cumulativeHeight;
    const rowBottom = cumulativeHeight + rowHeight;

    if (scrollTop < rowBottom) {
      // Scroll position is within this row
      const scrolledPastInRow = scrollTop - rowTop;

      // If we've scrolled more than halfway through this row,
      // anchor on the NEXT row (if it exists) for better visual stability
      if (scrolledPastInRow > rowHeight / 2 && i + 1 < rows.length) {
        return {
          videoIndex: videoIndex + row.photos.length,
          offsetFromRowTop: 0
        };
      }

      // Otherwise anchor on this row
      return { videoIndex, offsetFromRowTop: 0 };
    }

    cumulativeHeight += rowHeight;
    videoIndex += row.photos.length;
  }

  // Past all content, return last video
  return { videoIndex: Math.max(0, videoIndex - 1), offsetFromRowTop: 0 };
};

// Helper: Get scroll position to show a video's row at the viewport top
// Since we use offset=0, this simply returns the row's top position
const getScrollForAnchor = (
  anchor: AnchorInfo,
  rows: RowData[],
  spacing: number
): number => {
  let cumulativeHeight = 0;
  let videoIndex = 0;

  for (const row of rows) {
    if (videoIndex + row.photos.length > anchor.videoIndex) {
      // Target video is in this row - scroll to row top
      return cumulativeHeight;
    }
    cumulativeHeight += row.rowHeight + row.footerHeight + spacing;
    videoIndex += row.photos.length;
  }

  // Video not found (shouldn't happen), return end
  return cumulativeHeight;
};

// Calculate justified gallery layout
const calculateJustifiedLayout = (
  photos: Photo[],
  containerWidth: number,
  targetRowHeight: number = 120,
  spacing: number = 2,
  hasMore: boolean = false
): RowData[] => {
  const rows: RowData[] = [];
  let currentRow: Photo[] = [];
  let currentRowWidth = 0;

  photos.forEach((photo, index) => {
    const aspectRatio = photo.width / photo.height;
    const photoWidth = targetRowHeight * aspectRatio;

    // Add spacing for all photos except the first in the row
    const widthWithSpacing =
      currentRow.length > 0 ? photoWidth + spacing : photoWidth;

    if (
      currentRowWidth + widthWithSpacing <= containerWidth ||
      currentRow.length === 0
    ) {
      // Add photo to current row
      currentRow.push(photo);
      currentRowWidth += widthWithSpacing;
    } else {
      // Current row is full, calculate the actual height needed
      // to make the row width exactly match container width
      const totalSpacing = (currentRow.length - 1) * spacing;
      const totalAspectRatio = currentRow.reduce(
        (sum, p) => sum + p.width / p.height,
        0
      );
      const rowHeight = (containerWidth - totalSpacing) / totalAspectRatio;
      const maxFooter = Math.max(0, ...currentRow.map((p) => p.footerHeight ?? 0));

      rows.push({
        photos: [...currentRow],
        rowHeight: rowHeight,
        footerHeight: maxFooter,
      });

      // Start new row with current photo
      currentRow = [photo];
      currentRowWidth = photoWidth;
    }

    // Handle last row
    if (index === photos.length - 1 && currentRow.length > 0) {
      const isRowComplete = currentRowWidth >= containerWidth;

      // When hasMore=true and row is incomplete, hide it entirely.
      // These videos will appear correctly sized when the next batch loads.
      if (hasMore && !isRowComplete) {
        return;
      }

      const totalSpacing = (currentRow.length - 1) * spacing;
      const totalAspectRatio = currentRow.reduce(
        (sum, p) => sum + p.width / p.height,
        0
      );

      // For complete rows: stretch to fill width exactly
      // For incomplete rows (only when hasMore=false): use targetRowHeight, accept blank space
      const rowHeight = isRowComplete
        ? (containerWidth - totalSpacing) / totalAspectRatio
        : targetRowHeight;
      const maxFooter = Math.max(0, ...currentRow.map((p) => p.footerHeight ?? 0));

      rows.push({
        photos: [...currentRow],
        rowHeight: rowHeight,
        footerHeight: maxFooter,
      });
    }
  });

  return rows;
};

// Custom justified gallery component
export interface JustifiedGalleryProps {
  photos: Photo[];
  targetRowHeight?: number;
  spacing?: number;
  onClick?: (photo: Photo) => void;
  onHeightChange?: (height: number) => void;
  hasMore?: boolean; // When true, stretch last row to full width (for infinite scroll)
}

export const JustifiedGallery: React.FC<JustifiedGalleryProps> = ({
  photos,
  targetRowHeight = 120,
  spacing = 2,
  onClick,
  onHeightChange,
  hasMore = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Initialize with 0 to force a re-render after measuring real width
  const [containerWidth, setContainerWidth] = useState(0);
  // Track if we've done the initial measurement
  const hasMeasuredRef = useRef(false);

  // For scroll position preservation on resize
  const previousWidthRef = useRef<number>(0);
  const anchorRef = useRef<AnchorInfo | null>(null);
  const rowsRef = useRef<RowData[]>([]);
  // Persist anchor video across resize cycles to prevent drift
  const lastAnchorVideoIndexRef = useRef<number | null>(null);
  const expectedScrollTopRef = useRef<number | null>(null);

  // Measure container width synchronously before first paint
  // This ensures layout is correct before LazyVideo visibility checks run
  useLayoutEffect(() => {
    if (containerRef.current && !hasMeasuredRef.current) {
      const width = containerRef.current.getBoundingClientRect().width;
      if (width > 0) {
        setContainerWidth(width);
        previousWidthRef.current = width;
        hasMeasuredRef.current = true;
      }
    }
  }, []);

  // Update container width on resize using ResizeObserver
  // Capture anchor video BEFORE updating width to preserve scroll position
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) {
          const oldWidth = previousWidthRef.current;

          // If width actually changed and we have content, capture anchor
          if (oldWidth > 0 && Math.abs(newWidth - oldWidth) > 1 && rowsRef.current.length > 0) {
            const scrollContainer = findScrollContainer(containerRef.current);
            if (scrollContainer) {
              const scrollTop = scrollContainer.scrollTop;

              // Check if user has scrolled since last resize (with 5px tolerance)
              const userHasScrolled =
                expectedScrollTopRef.current === null ||
                Math.abs(scrollTop - expectedScrollTopRef.current) > 5;

              if (userHasScrolled || lastAnchorVideoIndexRef.current === null) {
                // User scrolled or first resize - calculate anchor from scroll position
                anchorRef.current = getAnchorAtScroll(scrollTop, rowsRef.current, spacing);
                lastAnchorVideoIndexRef.current = anchorRef.current.videoIndex;
              } else {
                // Keep using the same video as anchor to prevent drift
                anchorRef.current = {
                  videoIndex: lastAnchorVideoIndexRef.current,
                  offsetFromRowTop: 0
                };
              }
            }
          }

          previousWidthRef.current = newWidth;
          setContainerWidth(newWidth);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [spacing]);

  const rows = calculateJustifiedLayout(
    photos,
    containerWidth,
    targetRowHeight,
    spacing,
    hasMore
  );

  // Keep rowsRef in sync for use in ResizeObserver
  rowsRef.current = rows;

  // Restore scroll position after layout changes due to resize
  // Snaps to row boundaries (offset=0) to prevent drift across resize cycles
  useLayoutEffect(() => {
    if (anchorRef.current && rows.length > 0) {
      const scrollContainer = findScrollContainer(containerRef.current);
      if (scrollContainer) {
        const newScrollTop = getScrollForAnchor(anchorRef.current, rows, spacing);
        scrollContainer.scrollTop = newScrollTop;
        // Track expected scroll position so we can detect user scrolling
        expectedScrollTopRef.current = newScrollTop;
        anchorRef.current = null; // Clear anchor after restoring
      }
    }
  }, [rows, spacing]);

  // Notify parent of height changes for virtual scrolling
  useEffect(() => {
    if (containerRef.current && onHeightChange) {
      onHeightChange(containerRef.current.scrollHeight);
    }
  }, [rows, onHeightChange]);

  return (
    <div ref={containerRef} className="w-full">
      {/* Only render videos when we have a valid container width */}
      {containerWidth > 0 && rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex"
          style={{
            marginBottom: spacing,
            gap: spacing,
          }}
        >
          {row.photos.map((photo) => {
            const aspectRatio = photo.width / photo.height;
            const photoWidth = row.rowHeight * aspectRatio;

            return (
              <div key={photo.key} className="flex flex-col" style={{ width: photoWidth }}>
                <LazyVideo
                  src={photo.src}
                  width={photoWidth}
                  height={row.rowHeight}
                  onClick={() => onClick?.(photo)}
                />
                {photo.footer && (
                  <div style={{ height: photo.footerHeight ?? "auto" }}>
                    {photo.footer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
