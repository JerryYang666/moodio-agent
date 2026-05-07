/**
 * Element adapters — decompose an aggregated `ElementAsset` (the library
 * source-of-truth) into the native input shape for each reference-capable
 * video model. Pure functions: no UI, no network, no side effects.
 *
 * One library element fans out to many providers:
 *
 *   ElementAsset                                  ┌─► Seedance 2.0 reference
 *   ├─ imageIds[]                  applyElement…  ├─► FAL Kling V3 image-to-video
 *   ├─ videoId?                    ─────────────► ├─► FAL Kling O3 reference-to-video
 *   ├─ voiceId? (FAL provider)                    └─► KSyun Kling V3 Omni
 *   └─ ksyunElementId? (cached)
 *
 * Each adapter only exposes what its target accepts; fields without a slot
 * are dropped and the dropping is documented inline so future readers don't
 * re-investigate.
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
   * description.
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
 * Kling element mapping (used by all three Kling-family models — FAL V3
 * image-to-video, FAL O3 reference-to-video, KSyun V3 Omni). Each model has
 * its own provider-side normalization (see `lib/video/providers/*.ts`) that
 * picks up additional fields from the entry — `videoId`/`voiceId` (FAL Kling
 * V3 + O3) and `ksyunElementId` (KSyun) — when present.
 *
 *   - imageIds (up to 4) → element.element_input_ids
 *   - name, description  → element.name, element.description
 *   - videoId            → carried on the entry (FAL Kling V3/O3 → `video_url`)
 *   - voiceId            → carried on the entry (FAL Kling V3/O3 → `voice_id`;
 *                          undocumented in FAL llms.txt but supported by the API)
 *   - ksyunElementId     → carried on the entry (KSyun reuses it to skip create+poll)
 *   - libraryElementId   → carried so the backend can write KSyun id back to the library
 *
 * Returns an error when imageIds.length < 2 — Kling elements require 2–4 images.
 */
export function applyElementToKlingElements(
  el: ElementAsset,
  current: KlingElement[]
): KlingApplyResult {
  if (el.imageIds.length < KLING_ELEMENT_MIN_IMAGES) {
    return { next: current, error: "min-images" };
  }

  const entry: KlingElement & {
    videoId?: string;
    voiceId?: string;
    ksyunElementId?: number;
    ksyunSourceFingerprint?: string;
  } = {
    name: el.name,
    description: el.description,
    element_input_ids: el.imageIds.slice(0, KLING_ELEMENT_MAX_IMAGES),
    libraryElementId: el.id,
  };
  if (el.videoId) entry.videoId = el.videoId;
  if (el.voiceId) entry.voiceId = el.voiceId;
  if (typeof el.ksyunElementId === "number") {
    entry.ksyunElementId = el.ksyunElementId;
  }

  const next: KlingElement[] = [...current, entry];
  return { next };
}
