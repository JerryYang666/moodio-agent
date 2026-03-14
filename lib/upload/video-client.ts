import { siteConfig } from "@/config/site";
import { uploadImage } from "@/lib/upload/client";

export interface VideoUploadResult {
  videoId: string;
  videoUrl: string;
  thumbnailImageId?: string;
}

export interface VideoUploadError {
  code: "FILE_TOO_LARGE" | "INVALID_TYPE" | "PRESIGN_FAILED" | "UPLOAD_FAILED" | "CONFIRM_FAILED";
  message: string;
}

export type VideoUploadOutcome =
  | { success: true; data: VideoUploadResult }
  | { success: false; error: VideoUploadError };

export function validateVideoFile(file: File): VideoUploadError | null {
  const maxSize = siteConfig.upload.maxFileSizeMB * 1024 * 1024;
  const allowedTypes = siteConfig.upload.allowedVideoTypes;

  if (file.size > maxSize) {
    return {
      code: "FILE_TOO_LARGE",
      message: `File size exceeds ${siteConfig.upload.maxFileSizeMB}MB limit`,
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      code: "INVALID_TYPE",
      message: "Invalid file type. Supported: MP4, WebM, MOV (QuickTime), AVI",
    };
  }

  return null;
}

/**
 * Extract the first frame of a video file as a JPEG blob using
 * a transient <video> + <canvas> in the browser.
 */
export function extractVideoThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(video.src);

    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("Failed to get canvas context"));
          return;
        }
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error("Failed to extract video frame"));
          },
          "image/jpeg",
          0.85,
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video for thumbnail extraction"));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Upload a video thumbnail blob via the image presign flow.
 * Returns the imageId on success, or undefined if the upload fails.
 */
async function uploadThumbnail(blob: Blob): Promise<string | undefined> {
  const file = new File([blob], "thumbnail.jpg", { type: "image/jpeg" });
  const result = await uploadImage(file, { skipCollection: true });
  return result.success ? result.data.imageId : undefined;
}

export async function uploadVideo(file: File): Promise<VideoUploadOutcome> {
  const validationError = validateVideoFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
    // Start thumbnail extraction in parallel with the video presign request.
    // If extraction fails we proceed without a thumbnail.
    const thumbnailPromise = extractVideoThumbnail(file)
      .then(uploadThumbnail)
      .catch(() => undefined);

    const presignResponse = await fetch("/api/video/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: file.type,
        contentLength: file.size,
        filename: file.name,
      }),
    });

    if (!presignResponse.ok) {
      const errorData = await presignResponse.json().catch(() => ({}));
      return {
        success: false,
        error: {
          code: "PRESIGN_FAILED",
          message: errorData.error || "Failed to get upload URL",
        },
      };
    }

    const { videoId, uploadUrl } = await presignResponse.json();

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "Content-Length": file.size.toString(),
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      return {
        success: false,
        error: {
          code: "UPLOAD_FAILED",
          message: "Failed to upload to storage",
        },
      };
    }

    // Wait for thumbnail before confirming so we can pass its imageId
    const thumbnailImageId = await thumbnailPromise;

    const confirmResponse = await fetch("/api/video/upload/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        filename: file.name,
        thumbnailImageId,
      }),
    });

    if (!confirmResponse.ok) {
      const errorData = await confirmResponse.json().catch(() => ({}));
      return {
        success: false,
        error: {
          code: "CONFIRM_FAILED",
          message: errorData.error || "Failed to confirm upload",
        },
      };
    }

    const { videoUrl } = await confirmResponse.json();

    return {
      success: true,
      data: { videoId, videoUrl, thumbnailImageId },
    };
  } catch (error) {
    console.error("Video upload failed:", error);
    return {
      success: false,
      error: {
        code: "UPLOAD_FAILED",
        message: error instanceof Error ? error.message : "Upload failed",
      },
    };
  }
}
