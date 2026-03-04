import { siteConfig } from "@/config/site";

export interface UploadResult {
  imageId: string;
  imageUrl: string;
}

export interface UploadError {
  code: "FILE_TOO_LARGE" | "INVALID_TYPE" | "PRESIGN_FAILED" | "UPLOAD_FAILED" | "CONFIRM_FAILED";
  message: string;
}

export type UploadOutcome =
  | { success: true; data: UploadResult }
  | { success: false; error: UploadError };

export type UploadPhase = "uploading" | "compressing" | "done";

export interface UploadOptions {
  /** If true, skip saving the image to a collection (e.g., for marked/annotated images) */
  skipCollection?: boolean;
  /** Upload source for collection routing (defaults to "upload") */
  source?: "upload" | "frame-capture";
  /** Source video ID (only for frame-capture source) */
  sourceVideoId?: string;
  /** Called when the upload transitions between phases */
  onPhaseChange?: (phase: UploadPhase) => void;
}

/**
 * Get the maximum file size in bytes
 */
export function getMaxFileSizeBytes(): number {
  return siteConfig.upload.maxFileSizeMB * 1024 * 1024;
}

/**
 * Get the maximum file size in MB (for display)
 */
export function getMaxFileSizeMB(): number {
  return siteConfig.upload.maxFileSizeMB;
}

/**
 * Get the compression threshold in MB (for display)
 */
export function getCompressThresholdMB(): number {
  return siteConfig.upload.compressThresholdMB;
}

/**
 * Check whether a file exceeds the compression threshold and will be compressed server-side
 */
export function shouldCompressFile(file: File): boolean {
  return file.size > siteConfig.upload.compressThresholdMB * 1024 * 1024;
}

/**
 * Validate a file before upload
 * @returns null if valid, or an UploadError if invalid
 */
export function validateFile(file: File): UploadError | null {
  const maxSize = getMaxFileSizeBytes();
  const allowedTypes = siteConfig.upload.allowedImageTypes;

  if (file.size > maxSize) {
    return {
      code: "FILE_TOO_LARGE",
      message: `File size exceeds ${siteConfig.upload.maxFileSizeMB}MB limit`,
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      code: "INVALID_TYPE",
      message: "Invalid file type. Supported: JPEG, PNG, GIF, WebP",
    };
  }

  return null;
}

/**
 * Upload an image using presigned URL flow
 * This bypasses Vercel's 4.5MB request body limit by uploading directly to S3
 *
 * Flow:
 * 1. Request presigned URL from server
 * 2. Upload directly to S3
 * 3. Confirm upload with server (compresses if needed, creates DB records)
 *
 * @param file The file to upload
 * @param options Optional upload options
 * @returns UploadOutcome with either success data or error details
 */
export async function uploadImage(file: File, options?: UploadOptions): Promise<UploadOutcome> {
  // Validate file first
  const validationError = validateFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const willCompress = shouldCompressFile(file);

  try {
    // Step 1: Get presigned URL from server
    const presignResponse = await fetch("/api/image/upload/presign", {
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

    const { imageId, uploadUrl } = await presignResponse.json();

    // Step 2: Upload directly to S3 using presigned URL
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

    // Step 3: Confirm upload and create database records
    // Server will compress if file exceeds threshold
    if (willCompress) {
      options?.onPhaseChange?.("compressing");
    }

    const confirmResponse = await fetch("/api/image/upload/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageId,
        filename: file.name,
        skipCollection: options?.skipCollection,
        source: options?.source,
        sourceVideoId: options?.sourceVideoId,
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

    const { imageUrl } = await confirmResponse.json();

    options?.onPhaseChange?.("done");

    return {
      success: true,
      data: { imageId, imageUrl },
    };
  } catch (error) {
    console.error("Image upload failed:", error);
    return {
      success: false,
      error: {
        code: "UPLOAD_FAILED",
        message: error instanceof Error ? error.message : "Upload failed",
      },
    };
  }
}
