import JSZip from "jszip";
import { normalizeDownloadBasename } from "@/lib/download-filename";

/**
 * Minimal asset shape required by {@link bulkDownloadAssets}. Callers can pass
 * any object that structurally satisfies this (e.g. `AssetItem` from
 * collections, or lightweight objects built from production-table cells).
 */
export interface BulkDownloadAsset {
  assetId?: string;
  imageId?: string;
  assetType: string;
  generationDetails?: { title?: string };
}

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
function getProxyDownloadUrl(asset: BulkDownloadAsset): string | null {
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

// ---------------------------------------------------------------------------
// Signed-URL helpers (CloudFront direct download)
// ---------------------------------------------------------------------------

/** Max refs per /api/media/enrich call. */
const ENRICH_BATCH_SIZE = 50;

interface EnrichRef {
  type: "image" | "video" | "audio";
  id: string;
  filename?: string;
}

interface DownloadUrlEntry {
  url: string;
  filename: string;
}

/**
 * Map an BulkDownloadAsset to the ref shape accepted by /api/media/enrich.
 * Returns null when the asset lacks the ID needed for the enrich call.
 */
function assetToEnrichRef(asset: BulkDownloadAsset): EnrichRef | null {
  const basename = normalizeDownloadBasename(
    asset.generationDetails?.title,
    asset.assetType
  );

  if (asset.assetType === "video" || asset.assetType === "public_video") {
    if (!asset.assetId) return null;
    return { type: "video", id: asset.assetId, filename: basename };
  }
  if (asset.assetType === "audio") {
    if (!asset.assetId) return null;
    return { type: "audio", id: asset.assetId, filename: basename };
  }
  // image / public_image
  if (!asset.imageId) return null;
  return { type: "image", id: asset.imageId, filename: basename };
}

/**
 * Returns the media ID that identifies the asset in the enrich response
 * (matches the `id` field sent in the EnrichRef).
 */
function getMediaId(asset: BulkDownloadAsset): string | null {
  if (asset.assetType === "video" || asset.assetType === "public_video") {
    return asset.assetId || null;
  }
  if (asset.assetType === "audio") {
    return asset.assetId || null;
  }
  return asset.imageId || null;
}

/**
 * Fetch signed CloudFront download URLs for a batch of assets via the
 * /api/media/enrich endpoint (with download: true).
 *
 * Returns a map of mediaId → { url, filename }.
 * Chunks requests into groups of ENRICH_BATCH_SIZE to respect the endpoint limit.
 */
async function fetchSignedDownloadUrls(
  assets: BulkDownloadAsset[]
): Promise<Map<string, DownloadUrlEntry>> {
  const map = new Map<string, DownloadUrlEntry>();

  // Build refs, skipping assets without a usable ID
  const refs: EnrichRef[] = [];
  for (const asset of assets) {
    const ref = assetToEnrichRef(asset);
    if (ref) refs.push(ref);
  }

  if (refs.length === 0) return map;

  // Chunk into batches
  const chunks: EnrichRef[][] = [];
  for (let i = 0; i < refs.length; i += ENRICH_BATCH_SIZE) {
    chunks.push(refs.slice(i, i + ENRICH_BATCH_SIZE));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch("/api/media/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refs: chunk, download: true }),
        });
        if (!res.ok) return null;
        return (await res.json()) as {
          urls: Record<string, string>;
          downloadUrls?: Record<string, DownloadUrlEntry>;
        };
      } catch {
        return null;
      }
    })
  );

  for (const result of results) {
    if (!result?.downloadUrls) continue;
    for (const [id, entry] of Object.entries(result.downloadUrls)) {
      map.set(id, entry);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function bulkDownloadAssets(
  assets: BulkDownloadAsset[],
  zipFilename = "download.zip",
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  let done = 0;
  const total = assets.length;

  // Pre-fetch signed CloudFront download URLs for all assets.
  // If this fails entirely the loop falls back to proxy URLs.
  let signedUrlMap = new Map<string, DownloadUrlEntry>();
  try {
    signedUrlMap = await fetchSignedDownloadUrls(assets);
  } catch {
    // Proceed with proxy-only fallback
  }

  const CONCURRENCY = 4;
  let idx = 0;

  async function next(): Promise<void> {
    while (idx < assets.length) {
      const asset = assets[idx++];
      const mediaId = getMediaId(asset);
      const signedEntry = mediaId ? signedUrlMap.get(mediaId) : undefined;

      // Prefer signed CloudFront URL; fall back to proxy route
      const url = signedEntry?.url ?? getProxyDownloadUrl(asset);
      if (!url) {
        done++;
        onProgress?.(done, total);
        continue;
      }

      try {
        const response = await fetch(url);
        if (!response.ok) {
          // If signed URL failed (e.g. CORS not configured yet), retry via proxy
          if (signedEntry) {
            const proxyUrl = getProxyDownloadUrl(asset);
            if (proxyUrl) {
              const proxyResponse = await fetch(proxyUrl);
              if (proxyResponse.ok) {
                const blob = await proxyResponse.blob();
                const contentType = proxyResponse.headers.get("content-type");
                const ext = getExtension(contentType, asset.assetType);
                const basename = normalizeDownloadBasename(
                  asset.generationDetails?.title,
                  asset.assetType
                );
                const rawFilename = `${basename}${ext}`;
                const filename = deduplicateFilename(rawFilename, usedNames);
                zip.file(filename, blob);
                done++;
                onProgress?.(done, total);
                continue;
              }
            }
          }
          done++;
          onProgress?.(done, total);
          continue;
        }

        const contentType = response.headers.get("content-type");

        // Use filename from enrich response when available (has correct extension),
        // otherwise derive from content-type like before.
        let rawFilename: string;
        if (signedEntry?.filename) {
          rawFilename = signedEntry.filename;
        } else {
          const ext = getExtension(contentType, asset.assetType);
          const basename = normalizeDownloadBasename(
            asset.generationDetails?.title,
            asset.assetType
          );
          rawFilename = `${basename}${ext}`;
        }

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
