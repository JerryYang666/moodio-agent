/**
 * Element adapters — decompose an aggregated `ElementAsset` into the native
 * input shape for reference-capable video models.
 *
 * Pure functions: no UI, no network, no side effects. Trivially testable.
 *
 * See `lib/video/models.ts` for the source types and
 * `/Users/yangrh/.claude/plans/here-is-a-feature-fluffy-lecun.md` for the
 * design rationale.
 */

import type {
  ElementAsset,
  KlingElement,
  MediaReference,
} from "@/lib/video/models";

const SEEDANCE_ELEMENT_MAX_IMAGES = 2;
const KLING_ELEMENT_MAX_IMAGES = 4;
const KLING_ELEMENT_MIN_IMAGES = 2;

export interface SeedanceApplyResult {
  /** References to append to `media_references` (caller merges with existing). */
  appendReferences: MediaReference[];
  /**
   * Text to append to the composer's prompt field. Joined from element name +
   * description. The caller decides replace-vs-append (current recommendation
   * is append with a separator, see plan Open Question #2).
   */
  promptAppend: string;
}

export interface KlingApplyResult {
  /** The new kling_elements array (full replacement — caller assigns). */
  next: KlingElement[];
  /** Populated when the element could not be mapped (e.g., <2 images). */
  error?: "min-images";
}

/**
 * Seedance 2.0 Reference mapping:
 *   - first 2 imageIds  → image references
 *   - videoId (if set)  → video reference
 *   - voiceId (if set)  → audio reference (FAL voice ID passed as the audio id)
 *   - name + description → promptAppend ("name\ndescription")
 *
 * The composer's existing `media_references` are NOT returned — the caller
 * merges `appendReferences` onto its current state so it retains pins and
 * ordering.
 */
export function applyElementToSeedanceReference(
  el: ElementAsset
): SeedanceApplyResult {
  const appendReferences: MediaReference[] = [];

  for (const imageId of el.imageIds.slice(0, SEEDANCE_ELEMENT_MAX_IMAGES)) {
    appendReferences.push({ type: "image", id: imageId });
  }
  if (el.videoId) {
    appendReferences.push({ type: "video", id: el.videoId });
  }
  if (el.voiceId) {
    appendReferences.push({ type: "audio", id: el.voiceId });
  }

  const name = el.name.trim();
  const description = el.description.trim();
  const promptAppend =
    name && description
      ? `${name}\n${description}`
      : name || description;

  return { appendReferences, promptAppend };
}

/**
 * Kling O3 / V3 Reference mapping:
 *   - imageIds (up to 4) → element.element_input_ids
 *   - name, description  → element.name, element.description
 *   - videoId, voiceId   → dropped silently (no slot in Kling elements)
 *
 * Returns an error when imageIds.length < 2 — Kling elements require 2–4
 * images. The caller should block selection before invoking this, but the
 * adapter stays defensive.
 */
export function applyElementToKlingElements(
  el: ElementAsset,
  current: KlingElement[]
): KlingApplyResult {
  if (el.imageIds.length < KLING_ELEMENT_MIN_IMAGES) {
    return { next: current, error: "min-images" };
  }

  const next: KlingElement[] = [
    ...current,
    {
      name: el.name,
      description: el.description,
      element_input_ids: el.imageIds.slice(0, KLING_ELEMENT_MAX_IMAGES),
    },
  ];
  return { next };
}
