// Helper constants and functions for chat components

export const AWS_S3_PUBLIC_URL =
  process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL || "";

/**
 * @deprecated Use imageUrl from API response instead of constructing URLs client-side.
 * Images are now served via signed CloudFront URLs provided by the backend.
 */
export const getImageUrl = (imageId: string) => {
  console.warn(
    "[Deprecated] getImageUrl is deprecated. Use imageUrl from API response instead."
  );
  return `${AWS_S3_PUBLIC_URL}/${imageId}`;
};

// Helper to detect supported audio MIME type for MediaRecorder (iOS Safari compatibility)
export const getSupportedMimeType = (): string | null => {
  // Check if MediaRecorder is available
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  const types = [
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mpeg",
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log(`Using audio format: ${type}`);
      return type;
    }
  }

  console.warn("No supported audio format found");
  return null;
};

// Helper to get file extension from MIME type
export const getFileExtension = (mimeType: string): string => {
  const mimeToExtension: Record<string, string> = {
    "audio/webm": "webm",
    "audio/webm;codecs=opus": "webm",
    "audio/ogg;codecs=opus": "ogg",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mp4;codecs=mp4a.40.2": "mp4",
    "audio/mpeg": "mp3",
  };

  return mimeToExtension[mimeType] || "webm";
};

// Format timestamp to time string
export const formatTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

// Helper to trigger image download via backend API
// Uses the backend endpoint which sets Content-Disposition header to force download
export const downloadImage = async (
  imageId: string | undefined,
  title: string,
  url?: string
) => {
  if (!imageId) {
    console.error("No imageId provided for download");
    return;
  }

  // Sanitize filename
  const filename =
    title
      .replace(/[^a-z0-9\s-]/gi, "")
      .replace(/\s+/g, "_")
      .substring(0, 100) || "image";

  // Helper to trigger download from blob
  const downloadBlob = (blob: Blob, name: string) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  };

  // 1. Try fetching from direct URL (if provided)
  if (url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        downloadBlob(blob, filename);
        return;
      }
    } catch (error) {
      console.warn(
        "Direct download failed (likely CORS), trying backend proxy...",
        error
      );
    }
  }

  // Sanitize filename for URL
  const safeFilename = encodeURIComponent(filename);

  // Use the backend download endpoint
  const downloadUrl = `/api/image/${imageId}/download?filename=${safeFilename}`;

  // 2. Try fetching from backend proxy (avoids Vercel security checkpoint on navigation)
  try {
    const response = await fetch(downloadUrl);
    if (response.ok) {
      const contentType = response.headers.get("content-type");
      // Ensure we actually got an image and not an HTML error page
      if (contentType && contentType.startsWith("image/")) {
        const blob = await response.blob();
        downloadBlob(blob, filename);
        return;
      }
    }
  } catch (error) {
    console.warn("Backend proxy fetch failed, falling back to direct link", error);
  }

  // 3. Fallback: Create a hidden link and click it (Standard browser download)
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = ""; // Browser will use Content-Disposition filename
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
