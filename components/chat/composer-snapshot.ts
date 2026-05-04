import type { JSONContent } from "@tiptap/react";
import type {
  ComposerSnapshot,
  SerializableComposerPendingAudio,
  SerializableComposerPendingImage,
  SerializableComposerPendingVideo,
} from "@/lib/llm/types";
import type { MenuState } from "./menu-configuration";
import type { PendingImage } from "./pending-image-types";
import type { PendingVideo } from "./pending-video-types";
import type { PendingAudio } from "./pending-audio-types";
import type { AssetParamValue } from "./chat-input";

export const COMPOSER_SNAPSHOT_VERSION = 1;

interface BuildArgs {
  menuState: MenuState;
  pendingImages: PendingImage[];
  pendingVideos: PendingVideo[];
  pendingAudios: PendingAudio[];
  assetParamValues: Record<string, AssetParamValue | null>;
  precisionEditing: boolean;
  plainText: string;
  editorContent: JSONContent | null;
  mediaRefVideoDurations?: Record<string, number>;
}

// URLs are deliberately NOT serialized. CloudFront signed URLs expire and the
// CDN domain can differ between regions (e.g. cnMode). On restore we re-enrich
// IDs back into current display URLs via /api/media/enrich.
function serializeImages(imgs: PendingImage[]): SerializableComposerPendingImage[] {
  return imgs
    .filter((img) => !img.isUploading && !img.isCompressing)
    .map((img) => ({
      imageId: img.imageId,
      source: img.source,
      title: img.title,
      messageIndex: img.messageIndex,
      partIndex: img.partIndex,
      variantId: img.variantId,
      markedFromImageId: img.markedFromImageId,
    }));
}

function serializeVideos(vids: PendingVideo[]): SerializableComposerPendingVideo[] {
  return vids
    .filter((v) => !v.isUploading)
    .map((v) => ({
      videoId: v.videoId,
      source: v.source,
      title: v.title,
    }));
}

function serializeAudios(auds: PendingAudio[]): SerializableComposerPendingAudio[] {
  return auds
    .filter((a) => !a.isUploading)
    .map((a) => ({
      audioId: a.audioId,
      source: a.source,
      title: a.title,
    }));
}

function serializeAssetParams(
  params: Record<string, AssetParamValue | null>
): Record<string, { imageId: string } | null> {
  const out: Record<string, { imageId: string } | null> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = v ? { imageId: v.imageId } : null;
  }
  return out;
}

export function buildComposerSnapshot(args: BuildArgs): ComposerSnapshot {
  const {
    menuState,
    pendingImages,
    pendingVideos,
    pendingAudios,
    assetParamValues,
    precisionEditing,
    plainText,
    editorContent,
    mediaRefVideoDurations,
  } = args;

  const snapshot: ComposerSnapshot = {
    version: COMPOSER_SNAPSHOT_VERSION,
    mode: menuState.mode,
    model: menuState.model,
    expertise: menuState.expertise,
    aspectRatio: menuState.aspectRatio,
    imageSize: menuState.imageSize,
    imageQuality: menuState.imageQuality,
    imageQuantity: menuState.imageQuantity,
    videoModelId: menuState.videoModelId,
    videoParams: menuState.videoParams ? structuredClone(menuState.videoParams) : {},
    precisionEditing,
    pendingImages: serializeImages(pendingImages),
    pendingVideos: serializeVideos(pendingVideos),
    pendingAudios: serializeAudios(pendingAudios),
    assetParamValues: serializeAssetParams(assetParamValues),
    editorContent: editorContent ?? null,
    plainText,
  };

  if (mediaRefVideoDurations && Object.keys(mediaRefVideoDurations).length > 0) {
    snapshot.mediaRefVideoDurations = { ...mediaRefVideoDurations };
  }

  return snapshot;
}

export function isComposerSnapshot(value: unknown): value is ComposerSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ComposerSnapshot>;
  return v.version === COMPOSER_SNAPSHOT_VERSION && typeof v.mode === "string";
}

// Converters below leave `url` empty. Caller must enrich via /api/media/enrich
// and patch the resulting URL map into the pending arrays.
export function snapshotImagesToPending(
  imgs: SerializableComposerPendingImage[]
): PendingImage[] {
  return imgs.map((img) => ({
    imageId: img.imageId,
    url: "",
    source: img.source,
    title: img.title,
    messageIndex: img.messageIndex,
    partIndex: img.partIndex,
    variantId: img.variantId,
    markedFromImageId: img.markedFromImageId,
    isUploading: false,
  }));
}

export function snapshotVideosToPending(
  vids: SerializableComposerPendingVideo[]
): PendingVideo[] {
  return vids.map((v) => ({
    videoId: v.videoId,
    url: "",
    source: v.source,
    title: v.title,
    isUploading: false,
  }));
}

export function snapshotAudiosToPending(
  auds: SerializableComposerPendingAudio[]
): PendingAudio[] {
  return auds.map((a) => ({
    audioId: a.audioId,
    url: "",
    source: a.source,
    title: a.title,
    isUploading: false,
  }));
}
