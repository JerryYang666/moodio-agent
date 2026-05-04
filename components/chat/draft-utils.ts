/**
 * Chat Draft Utilities
 *
 * A draft IS a ComposerSnapshot. Drafts are real-time snapshots of the
 * composer state persisted to localStorage per chat, continuously updated
 * while the composer is active and deleted the moment the message is sent.
 *
 * This file also handles legacy (pre-snapshot) drafts that only carried
 * plain text + pending images: those are lifted into a minimal
 * ComposerSnapshot shape on read.
 */

import { siteConfig } from "@/config/site";
import type { ComposerSnapshot } from "@/lib/llm/types";
import { isComposerSnapshot, COMPOSER_SNAPSHOT_VERSION } from "./composer-snapshot";

export function getDraftKey(chatId: string | undefined): string {
  return `${siteConfig.chatInputPrefix}${chatId || "new-chat"}`;
}

export function saveComposerDraft(
  chatId: string | undefined,
  snapshot: ComposerSnapshot
): void {
  if (typeof window === "undefined") return;

  const key = getDraftKey(chatId);

  const isEmpty =
    !snapshot.plainText.trim() &&
    snapshot.pendingImages.length === 0 &&
    snapshot.pendingVideos.length === 0 &&
    snapshot.pendingAudios.length === 0 &&
    !((snapshot.videoParams?.media_references as unknown[] | undefined)?.length);

  if (isEmpty) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("Failed to remove chat draft:", e);
    }
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch (e) {
    console.warn("Failed to save chat draft:", e);
  }
}

export function loadComposerDraft(
  chatId: string | undefined
): ComposerSnapshot | null {
  if (typeof window === "undefined") return null;

  const key = getDraftKey(chatId);

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed: unknown = JSON.parse(stored);

    if (isComposerSnapshot(parsed)) {
      return parsed;
    }

    // Legacy string draft — just the text.
    if (typeof parsed === "string") {
      return legacyTextDraft(parsed);
    }

    // Legacy v1 ChatDraft shape — only plain text and pending images.
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { version?: unknown }).version === 1 &&
      typeof (parsed as { plainText?: unknown }).plainText === "string"
    ) {
      return legacyChatDraftToSnapshot(parsed as LegacyChatDraft);
    }

    return null;
  } catch (e) {
    console.warn("Failed to load chat draft:", e);
    return null;
  }
}

export function clearComposerDraft(chatId: string | undefined): void {
  if (typeof window === "undefined") return;

  const key = getDraftKey(chatId);

  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn("Failed to clear chat draft:", e);
  }
}

interface LegacyChatDraft {
  version: 1;
  editorContent: unknown | null;
  plainText: string;
  pendingImages: Array<{
    imageId: string;
    source: "upload" | "asset" | "ai_generated";
    title?: string;
    messageIndex?: number;
    partIndex?: number;
    variantId?: string;
    markedFromImageId?: string;
  }>;
  mediaReferences?: unknown[];
  mediaRefVideoDurations?: Record<string, number>;
}

function legacyTextDraft(text: string): ComposerSnapshot {
  return {
    version: COMPOSER_SNAPSHOT_VERSION,
    mode: "",
    model: "",
    expertise: "",
    aspectRatio: "",
    imageSize: "",
    imageQuality: "",
    imageQuantity: "",
    videoModelId: "",
    videoParams: {},
    precisionEditing: false,
    pendingImages: [],
    pendingVideos: [],
    pendingAudios: [],
    assetParamValues: {},
    editorContent: null,
    plainText: text,
  };
}

function legacyChatDraftToSnapshot(d: LegacyChatDraft): ComposerSnapshot {
  const videoParams: Record<string, unknown> = {};
  if (d.mediaReferences && d.mediaReferences.length > 0) {
    videoParams.media_references = d.mediaReferences;
  }
  return {
    version: COMPOSER_SNAPSHOT_VERSION,
    mode: "",
    model: "",
    expertise: "",
    aspectRatio: "",
    imageSize: "",
    imageQuality: "",
    imageQuantity: "",
    videoModelId: "",
    videoParams,
    precisionEditing: false,
    pendingImages: d.pendingImages.map((img) => ({
      imageId: img.imageId,
      source: img.source,
      title: img.title,
      messageIndex: img.messageIndex,
      partIndex: img.partIndex,
      variantId: img.variantId,
      markedFromImageId: img.markedFromImageId,
    })),
    pendingVideos: [],
    pendingAudios: [],
    assetParamValues: {},
    editorContent: (d.editorContent as ComposerSnapshot["editorContent"]) ?? null,
    plainText: d.plainText,
    ...(d.mediaRefVideoDurations && Object.keys(d.mediaRefVideoDurations).length > 0
      ? { mediaRefVideoDurations: d.mediaRefVideoDurations }
      : {}),
  };
}
