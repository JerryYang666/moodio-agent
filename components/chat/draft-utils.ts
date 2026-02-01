/**
 * Chat Draft Utilities
 * 
 * Handles saving and loading the complete chat input state including:
 * - Text content with mentions (TipTap JSON format)
 * - Pending images (excluding uploading images and local preview URLs)
 * - Menu configuration state
 * 
 * Drafts are saved on blur/visibility change to avoid performance issues
 * from real-time saving.
 */

import { siteConfig } from "@/config/site";
import { PendingImage } from "./pending-image-types";
import { MenuState, INITIAL_MENU_STATE } from "./menu-configuration";
import type { JSONContent } from "@tiptap/react";

/**
 * Serializable version of PendingImage (excludes transient fields)
 */
export interface SerializablePendingImage {
  imageId: string;
  url: string;
  source: PendingImage["source"];
  title?: string;
  messageIndex?: number;
  partIndex?: number;
  variantId?: string;
  markedFromImageId?: string;
}

/**
 * Complete chat draft state
 */
export interface ChatDraft {
  /** Version for future migration support */
  version: 1;
  /** TipTap editor JSON content (preserves mentions) */
  editorContent: JSONContent | null;
  /** Plain text fallback (for display/debugging) */
  plainText: string;
  /** Pending images (only fully uploaded ones) */
  pendingImages: SerializablePendingImage[];
  /** Timestamp when draft was saved */
  savedAt: number;
}

/**
 * Get the localStorage key for a chat draft
 */
export function getDraftKey(chatId: string | undefined): string {
  return `${siteConfig.chatInputPrefix}${chatId || "new-chat"}`;
}

/**
 * Convert PendingImage to serializable format
 * Excludes transient fields like isUploading and localPreviewUrl
 */
function toSerializablePendingImage(img: PendingImage): SerializablePendingImage | null {
  // Skip images that are still uploading
  if (img.isUploading) {
    return null;
  }
  
  return {
    imageId: img.imageId,
    url: img.url,
    source: img.source,
    title: img.title,
    messageIndex: img.messageIndex,
    partIndex: img.partIndex,
    variantId: img.variantId,
    markedFromImageId: img.markedFromImageId,
  };
}

/**
 * Convert serializable format back to PendingImage
 */
function fromSerializablePendingImage(img: SerializablePendingImage): PendingImage {
  return {
    ...img,
    isUploading: false,
  };
}

/**
 * Save chat draft to localStorage
 * 
 * @param chatId - The chat ID (undefined for new chat)
 * @param editorContent - TipTap editor JSON content
 * @param plainText - Plain text content
 * @param pendingImages - Array of pending images
 */
export function saveChatDraft(
  chatId: string | undefined,
  editorContent: JSONContent | null,
  plainText: string,
  pendingImages: PendingImage[]
): void {
  if (typeof window === "undefined") return;
  
  const key = getDraftKey(chatId);
  
  // Filter out uploading images and convert to serializable format
  const serializableImages = pendingImages
    .map(toSerializablePendingImage)
    .filter((img): img is SerializablePendingImage => img !== null);
  
  // Check if draft is empty
  const isEmpty = !plainText.trim() && serializableImages.length === 0;
  
  if (isEmpty) {
    // Remove draft if empty
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("Failed to remove chat draft:", e);
    }
    return;
  }
  
  const draft: ChatDraft = {
    version: 1,
    editorContent,
    plainText,
    pendingImages: serializableImages,
    savedAt: Date.now(),
  };
  
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (e) {
    console.warn("Failed to save chat draft:", e);
  }
}

/**
 * Load chat draft from localStorage
 * 
 * @param chatId - The chat ID (undefined for new chat)
 * @returns The loaded draft or null if not found/invalid
 */
export function loadChatDraft(chatId: string | undefined): ChatDraft | null {
  if (typeof window === "undefined") return null;
  
  const key = getDraftKey(chatId);
  
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    
    // Handle legacy format (plain string)
    if (typeof parsed === "string") {
      return {
        version: 1,
        editorContent: null,
        plainText: parsed,
        pendingImages: [],
        savedAt: 0,
      };
    }
    
    // Validate version
    if (parsed.version !== 1) {
      console.warn("Unknown draft version:", parsed.version);
      return null;
    }
    
    return parsed as ChatDraft;
  } catch (e) {
    console.warn("Failed to load chat draft:", e);
    return null;
  }
}

/**
 * Clear chat draft from localStorage
 * 
 * @param chatId - The chat ID (undefined for new chat)
 */
export function clearChatDraft(chatId: string | undefined): void {
  if (typeof window === "undefined") return;
  
  const key = getDraftKey(chatId);
  
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn("Failed to clear chat draft:", e);
  }
}

/**
 * Convert loaded draft images back to PendingImage format
 */
export function draftImagesToPendingImages(
  draftImages: SerializablePendingImage[]
): PendingImage[] {
  return draftImages.map(fromSerializablePendingImage);
}
