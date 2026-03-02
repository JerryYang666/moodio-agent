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

export type TextAssetMeta = {
  content: string;
  fontSize?: number;
  color?: string;
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

export type DesktopAssetMetadata =
  | { assetType: "image"; metadata: ImageAssetMeta }
  | { assetType: "video"; metadata: VideoAssetMeta }
  | { assetType: "text"; metadata: TextAssetMeta }
  | { assetType: "link"; metadata: LinkAssetMeta }
  | { assetType: "table"; metadata: TableAssetMeta };

const SUPPORTED_ASSET_TYPES = ["image", "video", "text", "link", "table"] as const;
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
  }

  return { valid: true, assetType: assetType as SupportedAssetType };
}

// ---------------------------------------------------------------------------
// Desktop viewport helpers
// ---------------------------------------------------------------------------

export interface DesktopViewport {
  camera: { x: number; y: number; zoom: number };
  /** Canvas container width in CSS pixels */
  width: number;
  /** Canvas container height in CSS pixels */
  height: number;
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
 * Compute a world-coordinate position that falls within the user's current
 * visible viewport with some random scatter so assets don't stack exactly.
 */
export function getViewportCenterPosition(): { x: number; y: number } {
  const vp = typeof window !== "undefined" ? window.__desktopViewport : undefined;
  if (!vp) {
    return { x: Math.random() * 200, y: Math.random() * 200 };
  }

  const { camera, width, height } = vp;
  const centerX = (-camera.x + width / 2) / camera.zoom;
  const centerY = (-camera.y + height / 2) / camera.zoom;

  const scatter = 80;
  return {
    x: centerX + (Math.random() - 0.5) * scatter,
    y: centerY + (Math.random() - 0.5) * scatter,
  };
}
