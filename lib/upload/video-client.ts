import { siteConfig } from "@/config/site";

export interface VideoUploadResult {
  videoId: string;
  videoUrl: string;
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
      message: "Invalid file type. Supported: MP4, WebM, MOV, AVI",
    };
  }

  return null;
}

export async function uploadVideo(file: File): Promise<VideoUploadOutcome> {
  const validationError = validateVideoFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
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

    const confirmResponse = await fetch("/api/video/upload/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        filename: file.name,
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
      data: { videoId, videoUrl },
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
