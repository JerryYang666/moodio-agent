// Helper constants and functions for chat components

export const AWS_S3_PUBLIC_URL =
  process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL || "";

// Helper to get image URL from S3
export const getImageUrl = (imageId: string) => {
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
export const downloadImage = (imageId: string | undefined, title: string) => {
  if (!imageId) {
    console.error("No imageId provided for download");
    return;
  }

  // Sanitize filename for URL
  const safeFilename = encodeURIComponent(
    title
      .replace(/[^a-z0-9\s-]/gi, "")
      .replace(/\s+/g, "_")
      .substring(0, 100) || "image"
  );

  // Use the backend download endpoint which sets Content-Disposition header
  const downloadUrl = `/api/image/${imageId}/download?filename=${safeFilename}`;

  // Create a hidden link and click it to trigger download
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = ""; // Browser will use Content-Disposition filename
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
