import { ReferenceImageTag } from "@/components/chat/reference-image-types";

/** A reference image stored as a persistent chat asset */
export interface PersistentReferenceImage {
  imageId: string;
  tag: ReferenceImageTag;
  title?: string;
}

/** Persistent assets attached to a chat, always sent to the LLM */
export interface PersistentAssets {
  referenceImages: PersistentReferenceImage[];
  textChunk: string;
}

export const MAX_TEXT_CHUNK_LENGTH = 5000;
export const MAX_PERSISTENT_REFERENCE_IMAGES = 4;

export const EMPTY_PERSISTENT_ASSETS: PersistentAssets = {
  referenceImages: [],
  textChunk: "",
};
