"use client";

import React, { useCallback, useMemo } from "react";
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
  width: number;
  height: number;
}

interface PublicGalleryProps {
  assets: PublicAsset[];
  onAssetClick: (index: number) => void;
}

function assetToMediaType(assetType: string): MediaType {
  if (assetType === "image" || assetType === "public_image") return "image";
  return "shot";
}

export function PublicGallery({ assets, onAssetClick }: PublicGalleryProps) {
  const photos: Photo[] = useMemo(
    () =>
      assets.map((asset, index) => ({
        src: asset.assetType === "video" || asset.assetType === "public_video"
          ? (asset.videoUrl || asset.imageUrl)
          : asset.imageUrl,
        width: asset.width || 512,
        height: asset.height || 512,
        alt: "",
        key: asset.id,
        id: index,
        videoName: "",
        mediaType: assetToMediaType(asset.assetType),
      })),
    [assets]
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
