export type ImageAssetMeta = {
  imageId: string;
  chatId?: string;
  title?: string;
  prompt?: string;
  status?: string;
  modelId?: string;
  aspectRatio?: string;
};

/**
 * Convert an aspect ratio string (e.g. "16:9") into pixel dimensions
 * that fit within the given target width.
 * Returns `null` if the string is not a valid "W:H" ratio.
 */
export function aspectRatioDimensions(
  aspectRatio: string | undefined | null,
  targetWidth = 300
): { w: number; h: number } | null {
  if (!aspectRatio) return null;
  const parts = aspectRatio.split(":");
  if (parts.length !== 2) return null;
  const rw = Number(parts[0]);
  const rh = Number(parts[1]);
  if (!rw || !rh || !Number.isFinite(rw) || !Number.isFinite(rh)) return null;
  return { w: targetWidth, h: Math.round(targetWidth * (rh / rw)) };
}

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

// ---------------------------------------------------------------------------
// Overlap detection helpers
// ---------------------------------------------------------------------------

const OVERLAP_GAP = 16; // minimum gap between assets when resolving overlaps

/**
 * Check if two rectangles overlap (with a small gap).
 */
function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap = OVERLAP_GAP
): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

/**
 * Check if a candidate position overlaps with any existing asset.
 */
function hasOverlap(
  candidate: { x: number; y: number; w: number; h: number },
  rects: AssetRect[],
  gap = OVERLAP_GAP
): boolean {
  return rects.some((r) => rectsOverlap(candidate, r, gap));
}

/**
 * Given a preferred position, nudge it so it does not overlap any existing
 * asset. Tries right, down, left, up in a spiral pattern.
 */
export function findNonOverlappingPosition(
  preferredX: number,
  preferredY: number,
  newW: number,
  newH: number,
  rects: AssetRect[] | undefined,
  gap = OVERLAP_GAP
): { x: number; y: number } {
  if (!rects || rects.length === 0) {
    return { x: preferredX, y: preferredY };
  }

  const candidate = { x: preferredX, y: preferredY, w: newW, h: newH };
  if (!hasOverlap(candidate, rects, gap)) {
    return { x: preferredX, y: preferredY };
  }

  // Spiral outward: try shifting in each direction with increasing step
  const step = Math.max(newW, newH) + gap;
  const directions = [
    { dx: 1, dy: 0 },  // right
    { dx: 0, dy: 1 },  // down
    { dx: -1, dy: 0 }, // left
    { dx: 0, dy: -1 }, // up
  ];

  for (let ring = 1; ring <= 20; ring++) {
    for (const dir of directions) {
      const cx = preferredX + dir.dx * step * ring;
      const cy = preferredY + dir.dy * step * ring;
      const test = { x: cx, y: cy, w: newW, h: newH };
      if (!hasOverlap(test, rects, gap)) {
        return { x: cx, y: cy };
      }
    }
  }

  // Fallback: place far to the right of all assets
  let maxRight = -Infinity;
  for (const r of rects) {
    const right = r.x + r.w;
    if (right > maxRight) maxRight = right;
  }
  return { x: maxRight + gap, y: preferredY };
}

/**
 * Find a good position for a new asset on the desktop.
 *
 * Strategy: find the densest cluster of existing assets and place the new
 * asset to the right of the rightmost asset in that cluster, with a small gap.
 * Falls back to viewport center if no assets exist.
 * After finding the candidate position, checks for overlaps and nudges if needed.
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

  const preferredX = maxRight + GAP;
  const preferredY = clusterMidY - newH / 2;

  return findNonOverlappingPosition(preferredX, preferredY, newW, newH, rects);
}

/**
 * Compute grid-based positions for new assets when the user is NOT actively
 * viewing the desktop.  Assets are laid out in rows of `columnsPerRow`
 * starting at the canvas origin (x = 0) and growing rightward, then downward.
 * Existing asset rects are taken into account to avoid any overlap.
 */
export function getGridPlacementPositions(
  newAssets: Array<{ w: number; h: number }>,
  existingRects: AssetRect[] = [],
  columnsPerRow = 4,
  gap = 24
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const allRects = [...existingRects];

  // Find the starting Y position — just below all existing assets (or 0)
  let startY = 0;
  for (const r of allRects) {
    const bottom = r.y + r.h;
    if (bottom + gap > startY) startY = bottom + gap;
  }
  // If there are no existing assets, start at y = 0
  if (allRects.length === 0) startY = 0;

  let currentCol = 0;
  let currentRowY = startY;
  let currentRowMaxH = 0;

  for (const asset of newAssets) {
    if (currentCol >= columnsPerRow) {
      currentCol = 0;
      currentRowY += currentRowMaxH + gap;
      currentRowMaxH = 0;
    }

    const preferredX = currentCol * (asset.w + gap);
    const preferredY = currentRowY;

    const pos = findNonOverlappingPosition(
      preferredX,
      preferredY,
      asset.w,
      asset.h,
      allRects,
      gap
    );
    positions.push(pos);
    allRects.push({ x: pos.x, y: pos.y, w: asset.w, h: asset.h });

    currentRowMaxH = Math.max(currentRowMaxH, asset.h);
    currentCol++;
  }

  return positions;
}

/**
 * Place an asset at the exact visual center of the current viewport.
 *
 * Unlike `getViewportCenterPosition`, this ignores existing asset clusters and
 * always returns the user's current view center so newly sent assets appear
 * immediately in front of the user.
 * After finding the candidate position, checks for overlaps and nudges if needed.
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

  const preferredX = centerX - newW / 2;
  const preferredY = centerY - newH / 2;

  return findNonOverlappingPosition(preferredX, preferredY, newW, newH, vp.assetRects);
}
