"use client";

import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { addToast } from "@heroui/toast";
import { useUploadImageSearchMutation } from "@/lib/redux/services/api";
import { setImageSearch, clearImageSearch } from "@/lib/redux/slices/querySlice";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

export interface ImageSearchUploadOptions {
  /** Optional override for the preview URL stored in Redux (defaults to a blob URL of the file). */
  previewUrl?: string | null;
}

export function useImageSearch() {
  const dispatch = useDispatch();
  const [uploadImage, { isLoading }] = useUploadImageSearchMutation();

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
    async (file: File, options?: ImageSearchUploadOptions): Promise<boolean> => {
      const error = validate(file);
      if (error) {
        addToast({ title: "Image search failed", description: error, color: "danger" });
        return false;
      }

      const previewUrl =
        options?.previewUrl !== undefined ? options.previewUrl : URL.createObjectURL(file);

      try {
        const result = await uploadImage(file).unwrap();
        dispatch(
          setImageSearch({ uploadId: result.upload_id, previewUrl: previewUrl ?? null })
        );
        return true;
      } catch (err) {
        if (previewUrl && options?.previewUrl === undefined) {
          URL.revokeObjectURL(previewUrl);
        }
        const message =
          (err as { data?: { error?: string } })?.data?.error ??
          "Could not upload image for search.";
        addToast({ title: "Image search failed", description: message, color: "danger" });
        return false;
      }
    },
    [uploadImage, validate, dispatch]
  );

  const searchByUrl = useCallback(
    async (imageUrl: string): Promise<boolean> => {
      try {
        const response = await fetch(imageUrl, { credentials: "include" });
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const blob = await response.blob();
        const fileType = ALLOWED_MIME.includes(blob.type) ? blob.type : "image/jpeg";
        const ext = fileType.split("/")[1] ?? "jpg";
        const file = new File([blob], `library-asset.${ext}`, { type: fileType });
        return await searchByFile(file, { previewUrl: imageUrl });
      } catch {
        addToast({
          title: "Image search failed",
          description: "Could not load the selected library image.",
          color: "danger",
        });
        return false;
      }
    },
    [searchByFile]
  );

  const clear = useCallback(() => {
    dispatch(clearImageSearch());
  }, [dispatch]);

  return { searchByFile, searchByUrl, clear, isUploading: isLoading };
}
