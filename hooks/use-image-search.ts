"use client";

import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { addToast } from "@heroui/toast";
import { useUploadImageSearchMutation } from "@/lib/redux/services/api";
import {
  beginImageSearch,
  setImageSearch,
  clearImageSearch,
} from "@/lib/redux/slices/querySlice";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

const guessMimeFromExtension = (url: string): string | null => {
  const match = url.toLowerCase().match(/\.(png|jpe?g|webp|gif)(?:\?|#|$)/);
  if (!match) return null;
  const ext = match[1] === "jpg" ? "jpeg" : match[1];
  return `image/${ext}`;
};

export function useImageSearch() {
  const dispatch = useDispatch();
  const [uploadImage, { isLoading: isUploadingMutation }] =
    useUploadImageSearchMutation();

  const validate = useCallback((file: File): string | null => {
    if (!ALLOWED_MIME.includes(file.type)) {
      return "Unsupported image type. Use PNG, JPEG, WebP, or GIF.";
    }
    if (file.size > MAX_BYTES) {
      return "Image is too large (max 10 MB).";
    }
    return null;
  }, []);

  const searchByFile = useCallback(
    async (file: File): Promise<boolean> => {
      const error = validate(file);
      if (error) {
        addToast({ title: "Image search failed", description: error, color: "danger" });
        return false;
      }

      // Show the spinner chip immediately so the user has feedback while
      // /api/upload is in flight.
      const previewUrl = URL.createObjectURL(file);
      dispatch(beginImageSearch({ previewUrl }));

      try {
        const result = await uploadImage(file).unwrap();
        dispatch(setImageSearch({ uploadId: result.upload_id, previewUrl }));
        return true;
      } catch (err) {
        URL.revokeObjectURL(previewUrl);
        dispatch(clearImageSearch());
        const message =
          (err as { data?: { error?: string } })?.data?.error ??
          "Could not upload image for search.";
        addToast({ title: "Image search failed", description: message, color: "danger" });
        return false;
      }
    },
    [uploadImage, validate, dispatch]
  );

  // For library assets we can't fetch the CloudFront URL directly from the
  // browser (cookie-based signed URLs + cross-origin CORS make `fetch` fail).
  // Route through the existing /api/image/proxy server endpoint, which holds
  // the auth context and returns the bytes same-origin.
  const searchByLibraryAsset = useCallback(
    async (asset: { imageId: string; imageUrl: string }): Promise<boolean> => {
      // Show the chip with the rendered library URL immediately — no need to
      // wait for the proxy fetch.
      dispatch(beginImageSearch({ previewUrl: asset.imageUrl }));

      try {
        const proxied = await fetch(
          `/api/image/proxy?imageId=${encodeURIComponent(asset.imageId)}`,
          { credentials: "include" }
        );
        if (!proxied.ok) {
          throw new Error(`Proxy fetch failed: ${proxied.status}`);
        }
        const blob = await proxied.blob();

        // The proxy returns the original Content-Type, but fall back to the
        // URL extension and finally to JPEG so we always pass an allowed MIME
        // through validate().
        const blobType = blob.type;
        const guessed =
          ALLOWED_MIME.includes(blobType)
            ? blobType
            : guessMimeFromExtension(asset.imageUrl) ?? "image/jpeg";
        const ext = guessed.split("/")[1] ?? "jpg";
        const file = new File([blob], `library-${asset.imageId}.${ext}`, {
          type: guessed,
        });

        const validationError = validate(file);
        if (validationError) {
          dispatch(clearImageSearch());
          addToast({
            title: "Image search failed",
            description: validationError,
            color: "danger",
          });
          return false;
        }

        const result = await uploadImage(file).unwrap();
        dispatch(
          setImageSearch({ uploadId: result.upload_id, previewUrl: asset.imageUrl })
        );
        return true;
      } catch (err) {
        console.error("[image-search] library asset upload failed", err);
        dispatch(clearImageSearch());
        const message =
          (err as { data?: { error?: string } })?.data?.error ??
          "Could not load the selected library image.";
        addToast({
          title: "Image search failed",
          description: message,
          color: "danger",
        });
        return false;
      }
    },
    [dispatch, uploadImage, validate]
  );

  const clear = useCallback(() => {
    dispatch(clearImageSearch());
  }, [dispatch]);

  return {
    searchByFile,
    searchByLibraryAsset,
    clear,
    isUploading: isUploadingMutation,
  };
}
