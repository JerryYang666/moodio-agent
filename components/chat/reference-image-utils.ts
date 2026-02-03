/**
 * Reference Images Storage Utilities
 *
 * Handles saving and loading reference images to/from localStorage.
 * Reference images are stored separately from chat drafts so they persist
 * even when drafts are cleared (e.g., after sending a message).
 */

import { siteConfig } from "@/config/site";
import { ReferenceImage } from "./reference-image-types";

/** Storage key prefix for reference images */
const REFERENCE_IMAGES_PREFIX = "moodio_reference_images_";

/** Storage key for collapsed state */
const REFERENCE_IMAGES_COLLAPSED_KEY = "moodio_reference_images_collapsed";

/**
 * Get the localStorage key for reference images
 */
export function getReferenceImagesKey(chatId: string | undefined): string {
  return `${REFERENCE_IMAGES_PREFIX}${chatId || "new-chat"}`;
}

/**
 * Save reference images to localStorage
 *
 * @param chatId - The chat ID (undefined for new chat)
 * @param images - Array of reference images to save
 */
export function saveReferenceImages(
  chatId: string | undefined,
  images: ReferenceImage[]
): void {
  if (typeof window === "undefined") return;

  const key = getReferenceImagesKey(chatId);

  if (images.length === 0) {
    // Remove from storage if empty
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("Failed to remove reference images:", e);
    }
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(images));
  } catch (e) {
    console.warn("Failed to save reference images:", e);
  }
}

/**
 * Load reference images from localStorage
 *
 * @param chatId - The chat ID (undefined for new chat)
 * @returns Array of reference images or empty array if not found
 */
export function loadReferenceImages(
  chatId: string | undefined
): ReferenceImage[] {
  if (typeof window === "undefined") return [];

  const key = getReferenceImagesKey(chatId);

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];

    const parsed = JSON.parse(stored);

    // Validate the structure
    if (!Array.isArray(parsed)) {
      console.warn("Invalid reference images format");
      return [];
    }

    // Basic validation of each image
    return parsed.filter(
      (img: any) =>
        img &&
        typeof img.imageId === "string" &&
        typeof img.url === "string" &&
        typeof img.tag === "string"
    );
  } catch (e) {
    console.warn("Failed to load reference images:", e);
    return [];
  }
}

/**
 * Clear reference images from localStorage
 *
 * @param chatId - The chat ID (undefined for new chat)
 */
export function clearReferenceImages(chatId: string | undefined): void {
  if (typeof window === "undefined") return;

  const key = getReferenceImagesKey(chatId);

  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn("Failed to clear reference images:", e);
  }
}

/**
 * Save the collapsed state of reference images section
 */
export function saveReferenceImagesCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(REFERENCE_IMAGES_COLLAPSED_KEY, JSON.stringify(collapsed));
  } catch (e) {
    console.warn("Failed to save reference images collapsed state:", e);
  }
}

/**
 * Load the collapsed state of reference images section
 * @returns The collapsed state, defaults to false (expanded)
 */
export function loadReferenceImagesCollapsed(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const stored = localStorage.getItem(REFERENCE_IMAGES_COLLAPSED_KEY);
    if (!stored) return false;
    return JSON.parse(stored) === true;
  } catch (e) {
    console.warn("Failed to load reference images collapsed state:", e);
    return false;
  }
}
