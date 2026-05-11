import { siteConfig } from "@/config/site";

export interface AudioUploadResult {
  audioId: string;
  audioUrl: string;
}

export interface AudioUploadError {
  code: "FILE_TOO_LARGE" | "INVALID_TYPE" | "PRESIGN_FAILED" | "UPLOAD_FAILED" | "CONFIRM_FAILED";
  message: string;
}

export type AudioUploadOutcome =
  | { success: true; data: AudioUploadResult }
  | { success: false; error: AudioUploadError };

// Safari reports WAV as audio/x-wav (sometimes audio/wave) and MP3 as audio/mp3;
// normalize to canonical MIME so everything downstream (S3 Content-Type, FAL) sees
// the same value regardless of browser.
export function normalizeAudioMime(file: File): string {
  const type = (file.type || "").toLowerCase();
  if (type === "audio/x-wav" || type === "audio/wave") return "audio/wav";
  if (type === "audio/mp3") return "audio/mpeg";
  if (!type) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "wav") return "audio/wav";
    if (ext === "mp3") return "audio/mpeg";
  }
  return type;
}

export function validateAudioFile(file: File): AudioUploadError | null {
  const maxSize = siteConfig.upload.maxFileSizeMB * 1024 * 1024;
  const allowedTypes = siteConfig.upload.allowedAudioTypes;

  if (file.size > maxSize) {
    return {
      code: "FILE_TOO_LARGE",
      message: `File size exceeds ${siteConfig.upload.maxFileSizeMB}MB limit`,
    };
  }

  const effectiveType = normalizeAudioMime(file);
  if (!allowedTypes.includes(effectiveType)) {
    return {
      code: "INVALID_TYPE",
      message: "Invalid file type. Supported: MP3, WAV",
    };
  }

  return null;
}

export interface AudioUploadOptions {
  skipCollection?: boolean;
}

export async function uploadAudio(file: File, options?: AudioUploadOptions): Promise<AudioUploadOutcome> {
  const validationError = validateAudioFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const contentType = normalizeAudioMime(file);

  try {
    const presignResponse = await fetch("/api/audio/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType,
        contentLength: file.size,
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

    const { audioId, uploadUrl } = await presignResponse.json();

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
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

    const confirmResponse = await fetch("/api/audio/upload/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioId,
        filename: file.name,
        skipCollection: options?.skipCollection,
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

    const { audioUrl } = await confirmResponse.json();

    return {
      success: true,
      data: { audioId, audioUrl },
    };
  } catch (error) {
    console.error("Audio upload failed:", error);
    return {
      success: false,
      error: {
        code: "UPLOAD_FAILED",
        message: error instanceof Error ? error.message : "Upload failed",
      },
    };
  }
}
