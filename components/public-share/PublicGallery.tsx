"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  JustifiedGallery,
  type Photo,
} from "@/components/browse/JustifiedGallery";
import { VideoVisibilityProvider } from "@/hooks/use-video-visibility";
import type { MediaType } from "@/lib/media";

export interface PublicAsset {
  id: string;
  imageUrl: string;
  videoUrl?: string;
  assetType: string;
}

interface PublicGalleryProps {
  assets: PublicAsset[];
  onAssetClick: (index: number) => void;
}

function assetToMediaType(assetType: string): MediaType {
  if (assetType === "image" || assetType === "public_image") return "image";
  return "shot";
}

function isVideo(assetType: string): boolean {
  return assetType === "video" || assetType === "public_video";
}

/**
 * Probes the natural dimensions of images and videos since collection_images
 * doesn't store width/height in the database. Falls back to 4:3 if probing fails.
 */
function useAssetDimensions(assets: PublicAsset[]) {
  const [dims, setDims] = useState<Map<string, { width: number; height: number }>>(
    () => new Map()
  );

  useEffect(() => {
    let cancelled = false;
    const newDims = new Map<string, { width: number; height: number }>();

    const probe = (asset: PublicAsset) =>
      new Promise<void>((resolve) => {
        if (isVideo(asset.assetType)) {
          const video = document.createElement("video");
          video.preload = "metadata";
          video.onloadedmetadata = () => {
            if (!cancelled && video.videoWidth > 0) {
              newDims.set(asset.id, { width: video.videoWidth, height: video.videoHeight });
            }
            video.src = "";
            resolve();
          };
          video.onerror = () => {
            resolve();
          };
          video.src = asset.videoUrl || asset.imageUrl;
        } else {
          const img = new Image();
          img.onload = () => {
            if (!cancelled && img.naturalWidth > 0) {
              newDims.set(asset.id, { width: img.naturalWidth, height: img.naturalHeight });
            }
            resolve();
          };
          img.onerror = () => {
            resolve();
          };
          img.src = asset.imageUrl;
        }
      });

    const BATCH_SIZE = 8;
    (async () => {
      for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = assets.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(probe));
        if (!cancelled) {
          setDims(new Map(newDims));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assets]);

  return dims;
}

const DEFAULT_W = 4;
const DEFAULT_H = 3;

export function PublicGallery({ assets, onAssetClick }: PublicGalleryProps) {
  const detectedDims = useAssetDimensions(assets);

  const photos: Photo[] = useMemo(
    () =>
      assets.map((asset, index) => {
        const detected = detectedDims.get(asset.id);
        const w = detected?.width ?? DEFAULT_W;
        const h = detected?.height ?? DEFAULT_H;
        return {
          src: isVideo(asset.assetType)
            ? (asset.videoUrl || asset.imageUrl)
            : asset.imageUrl,
          width: w,
          height: h,
          alt: "",
          key: asset.id,
          id: index,
          videoName: "",
          mediaType: assetToMediaType(asset.assetType),
        };
      }),
    [assets, detectedDims]
  );

  const handleClick = useCallback(
    (photo: Photo) => {
      onAssetClick(photo.id);
    },
    [onAssetClick]
  );

  if (photos.length === 0) return null;

  return (
    <VideoVisibilityProvider>
      <JustifiedGallery
        photos={photos}
        spacing={6}
        onClick={handleClick}
      />
    </VideoVisibilityProvider>
  );
}
