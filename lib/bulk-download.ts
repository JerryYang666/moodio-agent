import JSZip from "jszip";
import type { AssetItem } from "@/lib/types/asset";
import { normalizeDownloadBasename } from "@/lib/download-filename";

const EXTENSION_BY_ASSET_TYPE: Record<string, string> = {
  image: ".png",
  public_image: ".png",
  video: ".mp4",
  public_video: ".mp4",
  audio: ".mp3",
};

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
};

function getExtension(contentType: string | null, assetType: string): string {
  if (contentType) {
    const mapped = EXTENSION_BY_CONTENT_TYPE[contentType.split(";")[0].trim()];
    if (mapped) return mapped;
  }
  return EXTENSION_BY_ASSET_TYPE[assetType] ?? ".bin";
}

function deduplicateFilename(
  name: string,
  used: Map<string, number>
): string {
  const lower = name.toLowerCase();
  const count = used.get(lower);
  if (count === undefined) {
    used.set(lower, 1);
    return name;
  }
  used.set(lower, count + 1);
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx > 0) {
    return `${name.slice(0, dotIdx)} (${count})${name.slice(dotIdx)}`;
  }
  return `${name} (${count})`;
}

/**
 * Route downloads through backend API proxies to avoid CloudFront
 * signed-cookie / CORS 403 errors on cross-origin CDN fetches.
 */
function getProxyDownloadUrl(asset: AssetItem): string | null {
  const basename = encodeURIComponent(
    normalizeDownloadBasename(asset.generationDetails?.title, asset.assetType)
  );

  if (asset.assetType === "video" || asset.assetType === "public_video") {
    if (!asset.assetId) return null;
    return `/api/video/${encodeURIComponent(asset.assetId)}/download?filename=${basename}`;
  }
  if (asset.assetType === "audio") {
    if (!asset.assetId) return null;
    return `/api/audio/${encodeURIComponent(asset.assetId)}/download?filename=${basename}`;
  }
  // image / public_image
  if (asset.imageId) {
    return `/api/image/${encodeURIComponent(asset.imageId)}/download?filename=${basename}`;
  }
  return null;
}

export async function bulkDownloadAssets(
  assets: AssetItem[],
  zipFilename = "download.zip",
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  let done = 0;
  const total = assets.length;

  const CONCURRENCY = 4;
  let idx = 0;

  async function next(): Promise<void> {
    while (idx < assets.length) {
      const asset = assets[idx++];
      const url = getProxyDownloadUrl(asset);
      if (!url) {
        done++;
        onProgress?.(done, total);
        continue;
      }

      try {
        const response = await fetch(url);
        if (!response.ok) {
          done++;
          onProgress?.(done, total);
          continue;
        }

        const contentType = response.headers.get("content-type");
        const ext = getExtension(contentType, asset.assetType);
        const basename = normalizeDownloadBasename(
          asset.generationDetails?.title,
          asset.assetType
        );
        const rawFilename = `${basename}${ext}`;
        const filename = deduplicateFilename(rawFilename, usedNames);

        const blob = await response.blob();
        zip.file(filename, blob);
      } catch {
        // skip failed individual files silently
      }

      done++;
      onProgress?.(done, total);
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, assets.length) },
    () => next()
  );
  await Promise.all(workers);

  if (zip.length === 0) {
    throw new Error("No files could be downloaded");
  }

  const blob = await zip.generateAsync({ type: "blob" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
