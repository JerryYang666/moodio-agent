export type ImageAssetMeta = {
  imageId: string;
  chatId?: string;
  title?: string;
  prompt?: string;
  status?: string;
  modelId?: string;
};

export type VideoAssetMeta = {
  imageId: string;
  videoId?: string;
  generationId?: string; // Links to videoGenerations table as canonical record
  chatId?: string;
  title?: string;
  prompt?: string;
  status?: string;
  duration?: number;
  modelId?: string;
};

export type PublicVideoAssetMeta = {
  storageKey: string;
  contentUuid: string;
  title?: string;
  width?: number;
  height?: number;
};

export type TextAssetMeta = {
  content: string;
  fontSize?: number;
  color?: string;
  chatId?: string;
};

export type LinkAssetMeta = {
  url: string;
  title?: string;
  thumbnailUrl?: string;
};

export type TableCell = {
  value: string;
};

export type TableRow = {
  id: string;
  cells: TableCell[];
};

export type TableAssetMeta = {
  title: string;
  columns: string[];
  rows: TableRow[];
  chatId?: string;
  status?: "streaming" | "complete";
};

export type VideoSuggestAssetMeta = {
  imageId: string;
  chatId?: string;
  title: string;
  videoIdea: string;
  prompt?: string;
  aspectRatio?: string;
  /** Timestamp of the message this card belongs to (for chat sync) */
  messageTimestamp?: number;
  /** Variant ID of the message (for chat sync) */
  messageVariantId?: string;
  /** Index of this part among agent_video_suggest parts in the message */
  partTypeIndex?: number;
};

export type DesktopAssetMetadata =
  | { assetType: "image"; metadata: ImageAssetMeta }
  | { assetType: "video"; metadata: VideoAssetMeta }
  | { assetType: "public_video"; metadata: PublicVideoAssetMeta }
  | { assetType: "text"; metadata: TextAssetMeta }
  | { assetType: "link"; metadata: LinkAssetMeta }
  | { assetType: "table"; metadata: TableAssetMeta }
  | { assetType: "video_suggest"; metadata: VideoSuggestAssetMeta };

const SUPPORTED_ASSET_TYPES = ["image", "video", "public_video", "text", "link", "table", "video_suggest"] as const;
export type SupportedAssetType = (typeof SUPPORTED_ASSET_TYPES)[number];

export function validateAssetMetadata(
  assetType: string,
  metadata: unknown
): { valid: true; assetType: SupportedAssetType } | { valid: false; error: string } {
  if (!SUPPORTED_ASSET_TYPES.includes(assetType as SupportedAssetType)) {
    return { valid: false, error: `Unsupported asset type: ${assetType}` };
  }

  if (!metadata || typeof metadata !== "object") {
    return { valid: false, error: "metadata must be a non-null object" };
  }

  const m = metadata as Record<string, unknown>;

  switch (assetType) {
    case "image":
      if (typeof m.imageId !== "string" || !m.imageId) {
        return { valid: false, error: "image metadata requires a non-empty imageId string" };
      }
      break;
    case "video":
      if (typeof m.imageId !== "string" || !m.imageId) {
        return { valid: false, error: "video metadata requires a non-empty imageId string" };
      }
      // Video asset requires either videoId (completed) or generationId (in-progress/pending)
      const hasVideoId = typeof m.videoId === "string" && m.videoId;
      const hasGenerationId = typeof m.generationId === "string" && m.generationId;
      if (!hasVideoId && !hasGenerationId) {
        return { valid: false, error: "video metadata requires either a videoId or generationId" };
      }
      break;
    case "public_video":
      if (typeof m.storageKey !== "string" || !m.storageKey) {
        return { valid: false, error: "public_video metadata requires a non-empty storageKey string" };
      }
      if (typeof m.contentUuid !== "string" || !m.contentUuid) {
        return { valid: false, error: "public_video metadata requires a non-empty contentUuid string" };
      }
      break;
    case "text":
      if (typeof m.content !== "string") {
        return { valid: false, error: "text metadata requires a content string" };
      }
      break;
    case "link":
      if (typeof m.url !== "string" || !m.url) {
        return { valid: false, error: "link metadata requires a non-empty url string" };
      }
      break;
    case "table":
      if (typeof m.title !== "string" || !m.title) {
        return { valid: false, error: "table metadata requires a non-empty title string" };
      }
      if (!Array.isArray(m.columns) || m.columns.length === 0) {
        return { valid: false, error: "table metadata requires a non-empty columns array" };
      }
      if (!Array.isArray(m.rows)) {
        return { valid: false, error: "table metadata requires a rows array" };
      }
      break;
    case "video_suggest":
      if (typeof m.imageId !== "string" || !m.imageId) {
        return { valid: false, error: "video_suggest metadata requires a non-empty imageId string" };
      }
      if (typeof m.title !== "string") {
        return { valid: false, error: "video_suggest metadata requires a title string" };
      }
      break;
  }

  return { valid: true, assetType: assetType as SupportedAssetType };
}

// ---------------------------------------------------------------------------
// Desktop viewport helpers
// ---------------------------------------------------------------------------

export interface AssetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DesktopViewport {
  camera: { x: number; y: number; zoom: number };
  /** Canvas container width in CSS pixels */
  width: number;
  /** Canvas container height in CSS pixels */
  height: number;
  /** Bounding boxes of existing assets in world coordinates */
  assetRects?: AssetRect[];
}

declare global {
  interface Window {
    __desktopViewport?: DesktopViewport;
  }
}

/**
 * Store the current desktop viewport on `window` so that components outside
 * the React tree (e.g. the chat panel) can read it synchronously.
 */
export function setDesktopViewport(viewport: DesktopViewport) {
  if (typeof window !== "undefined") {
    window.__desktopViewport = viewport;
  }
}

export function clearDesktopViewport() {
  if (typeof window !== "undefined") {
    delete window.__desktopViewport;
  }
}

/**
 * Find a good position for a new asset on the desktop.
 *
 * Strategy: find the densest cluster of existing assets and place the new
 * asset to the right of the rightmost asset in that cluster, with a small gap.
 * Falls back to viewport center if no assets exist.
 *
 * @param newW  Width of the asset being placed (default 400)
 * @param newH  Height of the asset being placed (default 300)
 */
export function getViewportCenterPosition(newW = 400, newH = 300): { x: number; y: number } {
  const vp = typeof window !== "undefined" ? window.__desktopViewport : undefined;
  if (!vp) {
    return { x: Math.random() * 200, y: Math.random() * 200 };
  }

  const { camera, width, height } = vp;
  const rects = vp.assetRects;

  // Viewport center in world coordinates (fallback)
  const centerX = (-camera.x + width / 2) / camera.zoom;
  const centerY = (-camera.y + height / 2) / camera.zoom;

  if (!rects || rects.length === 0) {
    return { x: centerX - newW / 2, y: centerY - newH / 2 };
  }

  // For each asset, count how many neighbors are within PROXIMITY_RADIUS of
  // its center, then pick the asset with the highest neighbor count (= densest spot).
  const PROXIMITY_RADIUS = 600;
  const centers = rects.map((r) => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, ...r }));

  let bestIdx = 0;
  let bestCount = -1;
  for (let i = 0; i < centers.length; i++) {
    let count = 0;
    for (let j = 0; j < centers.length; j++) {
      if (i === j) continue;
      const dx = centers[i].cx - centers[j].cx;
      const dy = centers[i].cy - centers[j].cy;
      if (dx * dx + dy * dy < PROXIMITY_RADIUS * PROXIMITY_RADIUS) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestIdx = i;
    }
  }

  // Collect the cluster: all assets within PROXIMITY_RADIUS of the densest asset
  const anchor = centers[bestIdx];
  const cluster = centers.filter((c) => {
    const dx = c.cx - anchor.cx;
    const dy = c.cy - anchor.cy;
    return dx * dx + dy * dy < PROXIMITY_RADIUS * PROXIMITY_RADIUS;
  });

  // Find the bounding box of the cluster
  let maxRight = -Infinity;
  let clusterTop = Infinity;
  let clusterBottom = -Infinity;
  for (const c of cluster) {
    const right = c.x + c.w;
    if (right > maxRight) maxRight = right;
    if (c.y < clusterTop) clusterTop = c.y;
    if (c.y + c.h > clusterBottom) clusterBottom = c.y + c.h;
  }

  const GAP = 24;
  const clusterMidY = (clusterTop + clusterBottom) / 2;

  return {
    x: maxRight + GAP,
    y: clusterMidY - newH / 2,
  };
}

/**
 * Place an asset at the exact visual center of the current viewport.
 *
 * Unlike `getViewportCenterPosition`, this ignores existing asset clusters and
 * always returns the user's current view center so newly sent assets appear
 * immediately in front of the user.
 */
export function getViewportVisibleCenterPosition(
  newW = 400,
  newH = 300
): { x: number; y: number } {
  const vp = typeof window !== "undefined" ? window.__desktopViewport : undefined;
  if (!vp) {
    return { x: Math.random() * 200, y: Math.random() * 200 };
  }

  const { camera, width, height } = vp;
  const centerX = (-camera.x + width / 2) / camera.zoom;
  const centerY = (-camera.y + height / 2) / camera.zoom;
  return { x: centerX - newW / 2, y: centerY - newH / 2 };
}
