/**
 * Types for the Reference Images system
 *
 * Reference images are persistent images that users can add to provide context
 * for AI generation. Unlike pending images, they are NOT cleared when a message
 * is sent, allowing users to maintain a consistent set of reference materials
 * across multiple interactions.
 *
 * Each reference image can be tagged with a category to help the AI understand
 * its purpose: Subject (人物), Scene (场景), Item (物品), or Style (风格).
 */

/** Available tags for categorizing reference images */
export type ReferenceImageTag = "none" | "subject" | "scene" | "item" | "style";

/** All available reference image tags */
export const REFERENCE_IMAGE_TAGS: ReferenceImageTag[] = [
  "none",
  "subject",
  "scene",
  "item",
  "style",
];

export interface ReferenceImage {
  /** Unique ID of the image in S3 storage */
  imageId: string;
  /** CloudFront URL for displaying the image */
  url: string;
  /** Display title for the image */
  title?: string;
  /** Category tag for the reference image */
  tag: ReferenceImageTag;
}

/** Maximum number of reference images that can be added */
export const MAX_REFERENCE_IMAGES = 5;

/**
 * Check if more reference images can be added
 */
export function canAddReferenceImage(referenceImages: ReferenceImage[]): boolean {
  return referenceImages.length < MAX_REFERENCE_IMAGES;
}
