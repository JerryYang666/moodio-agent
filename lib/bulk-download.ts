import JSZip from "jszip";
import { normalizeDownloadBasename } from "@/lib/download-filename";

/**
 * Image output format supported by the per-image conversion proxy
 * (`/api/image/[imageId]/download?format=…`). Mirrors
 * `ImageDownloadFormat` in `components/chat/utils.ts`.
 */
export type ImageDownloadFormat = "webp" | "png" | "jpeg";

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

export interface BulkDownloadOptions {
  /**
   * When set, image assets (`assetType === "image"` or `"public_image"`) are
   * routed through the backend conversion proxy and re-encoded to this
   * format before being added to the zip. Non-image assets are unaffected
   * and download in their native container.
   *
   * Leave undefined to download every asset in its original format (the
   * fastest path — uses signed CloudFront URLs directly).
   */
  imageFormat?: ImageDownloadFormat;
  onProgress?: (done: number, total: number) => void;
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

const IMAGE_EXTENSION_BY_FORMAT: Record<ImageDownloadFormat, string> = {
  webp: ".webp",
  png: ".png",
  jpeg: ".jpg",
};

function isImageAsset(assetType: string): boolean {
  return assetType === "image" || assetType === "public_image";
}

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
 * signed-cookie / CORS 403 errors on cross-origin CDN fetches. When
 * `imageFormat` is supplied and the asset is an image, the URL also
 * carries `&format=…` so the backend re-encodes via Sharp.
 */
function getProxyDownloadUrl(
  asset: BulkDownloadAsset,
  imageFormat?: ImageDownloadFormat
): string | null {
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
    const formatSuffix = imageFormat ? `&format=${imageFormat}` : "";
    return `/api/image/${encodeURIComponent(asset.imageId)}/download?filename=${basename}${formatSuffix}`;
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
  options: BulkDownloadOptions = {}
): Promise<void> {
  const { imageFormat, onProgress } = options;
  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  let done = 0;
  const total = assets.length;

  // When a specific image format is requested, the signed CloudFront URL
  // can't be used for image assets (CDN serves the raw S3 bytes — only the
  // backend proxy can run Sharp). So we only fetch signed URLs for the
  // assets that can use them: everything that isn't an image-with-format.
  const assetsNeedingSignedUrls = imageFormat
    ? assets.filter((a) => !isImageAsset(a.assetType))
    : assets;

  let signedUrlMap = new Map<string, DownloadUrlEntry>();
  try {
    signedUrlMap = await fetchSignedDownloadUrls(assetsNeedingSignedUrls);
  } catch {
    // Proceed with proxy-only fallback
  }

  const CONCURRENCY = 4;
  let idx = 0;

  /**
   * Build the rawFilename from a successful response. Prefers the filename
   * supplied by the enrich endpoint (if any), then derives from the
   * response's content-type, falling back to the requested image format
   * extension or the asset-type default.
   */
  function deriveRawFilename(
    asset: BulkDownloadAsset,
    response: Response,
    signedFilename: string | undefined,
    isImageFormatPath: boolean
  ): string {
    if (signedFilename) return signedFilename;

    const contentType = response.headers.get("content-type");
    let ext = getExtension(contentType, asset.assetType);

    // If we forced image conversion but content-type lookup didn't yield
    // a recognised extension (e.g. server fell back to raw bytes), use the
    // requested format's extension so the filename still makes sense.
    if (
      isImageFormatPath &&
      imageFormat &&
      ext === EXTENSION_BY_ASSET_TYPE[asset.assetType]
    ) {
      ext = IMAGE_EXTENSION_BY_FORMAT[imageFormat];
    }

    const basename = normalizeDownloadBasename(
      asset.generationDetails?.title,
      asset.assetType
    );
    return `${basename}${ext}`;
  }

  async function next(): Promise<void> {
    while (idx < assets.length) {
      const asset = assets[idx++];
      const useImageFormatProxy =
        imageFormat !== undefined && isImageAsset(asset.assetType);

      const mediaId = getMediaId(asset);
      const signedEntry =
        useImageFormatProxy || !mediaId
          ? undefined
          : signedUrlMap.get(mediaId);

      // For images-with-format we always go through the proxy because the
      // CDN can't run conversion. For everything else we prefer signed URLs.
      const proxyUrl = getProxyDownloadUrl(
        asset,
        useImageFormatProxy ? imageFormat : undefined
      );
      const url = signedEntry?.url ?? proxyUrl;
      if (!url) {
        done++;
        onProgress?.(done, total);
        continue;
      }

      try {
        const response = await fetch(url);
        if (!response.ok) {
          // If signed URL failed (e.g. CORS not configured yet), retry via proxy
          if (signedEntry && proxyUrl) {
            const proxyResponse = await fetch(proxyUrl);
            if (proxyResponse.ok) {
              const blob = await proxyResponse.blob();
              const rawFilename = deriveRawFilename(
                asset,
                proxyResponse,
                undefined,
                useImageFormatProxy
              );
              const filename = deduplicateFilename(rawFilename, usedNames);
              zip.file(filename, blob);
              done++;
              onProgress?.(done, total);
              continue;
            }
          }
          done++;
          onProgress?.(done, total);
          continue;
        }

        // Filename from enrich is only trustworthy for the original-format
        // path; if we forced image conversion, derive from the proxy
        // response's content-type instead.
        const rawFilename = deriveRawFilename(
          asset,
          response,
          useImageFormatProxy ? undefined : signedEntry?.filename,
          useImageFormatProxy
        );
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
