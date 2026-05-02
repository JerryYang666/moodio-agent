/**
 * Asset Groups (抽卡组) service
 *
 * A "group" is a folder with `modality` set ("image" | "video"). Plain folders
 * (modality null) behave as before. Members of a group are
 * `collection_images` rows whose `folderId` references the group folder.
 * Per-member triage (`candidate` | `good` | `final`) lives on
 * `collection_images.groupStatus`.
 *
 * This module is small on purpose — most heavy lifting reuses existing folder
 * infrastructure (`lib/folder-utils.ts`, folder API routes, `folderShares`).
 */

import { db } from "@/lib/db";
import {
  folders,
  collectionImages,
  videoGenerations,
  collections,
} from "@/lib/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import {
  generateImageWithModel,
  editImageWithModel,
} from "@/lib/image/service";
import type {
  ImageEditInput,
  ImageGenerationInput,
} from "@/lib/image/types";
import { uploadImage } from "@/lib/storage/s3";

// ---------------------------------------------------------------------------
// Modality
// ---------------------------------------------------------------------------

export type GroupModality = "image" | "video";
export type GroupStatus = "candidate" | "good" | "final";

/**
 * Whether an asset type is acceptable for a folder of the given modality.
 * Image groups accept `image` and `public_image`; video groups accept `video`
 * and `public_video`. Audio is never group-eligible (no audio modality).
 */
export function assetTypeMatchesModality(
  assetType: string,
  modality: GroupModality
): boolean {
  if (modality === "image") {
    return assetType === "image" || assetType === "public_image";
  }
  if (modality === "video") {
    return assetType === "video" || assetType === "public_video";
  }
  return false;
}

/**
 * Look up a folder's modality. Returns null if the folder doesn't exist or is
 * a plain (non-group) folder.
 */
export async function getFolderModality(
  folderId: string
): Promise<GroupModality | null> {
  const [folder] = await db
    .select({ modality: folders.modality })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);
  if (!folder || !folder.modality) return null;
  return folder.modality as GroupModality;
}

/**
 * Throws an Error with a stable code if the asset type is not acceptable for
 * the folder. Skips check when the folder is not a group.
 *
 * Caller is responsible for translating thrown error codes into HTTP status.
 */
export async function assertModalityMatches(
  folderId: string,
  assetType: string
): Promise<void> {
  const modality = await getFolderModality(folderId);
  if (!modality) return;
  if (!assetTypeMatchesModality(assetType, modality)) {
    const err = new Error(
      `Asset type ${assetType} cannot be added to a ${modality} group`
    );
    (err as Error & { code: string }).code = "GROUP_MODALITY_MISMATCH";
    throw err;
  }
}

/**
 * Returns true if the folder has modality set (i.e. it is a group).
 */
export async function isGroupFolder(folderId: string): Promise<boolean> {
  const modality = await getFolderModality(folderId);
  return modality !== null;
}

// ---------------------------------------------------------------------------
// Member status / cover
// ---------------------------------------------------------------------------

const ALLOWED_STATUSES: GroupStatus[] = ["candidate", "good", "final"];

export function isValidGroupStatus(value: unknown): value is GroupStatus {
  return (
    typeof value === "string" &&
    (ALLOWED_STATUSES as string[]).includes(value)
  );
}

/**
 * Update a member's groupStatus. The member must currently belong to the
 * folder (folderId match). Throws if not.
 */
export async function setMemberStatus(
  folderId: string,
  collectionImageId: string,
  status: GroupStatus | null
): Promise<void> {
  const [updated] = await db
    .update(collectionImages)
    .set({ groupStatus: status })
    .where(
      and(
        eq(collectionImages.id, collectionImageId),
        eq(collectionImages.folderId, folderId)
      )
    )
    .returning({ id: collectionImages.id });

  if (!updated) {
    const err = new Error("Member not found in folder");
    (err as Error & { code: string }).code = "GROUP_MEMBER_NOT_FOUND";
    throw err;
  }
}

/**
 * Set the folder's designated cover. The collection_image must belong to the
 * folder. Pass null to clear.
 */
export async function setGroupCover(
  folderId: string,
  collectionImageId: string | null
): Promise<void> {
  if (collectionImageId !== null) {
    const [member] = await db
      .select({ id: collectionImages.id })
      .from(collectionImages)
      .where(
        and(
          eq(collectionImages.id, collectionImageId),
          eq(collectionImages.folderId, folderId)
        )
      )
      .limit(1);
    if (!member) {
      const err = new Error("Cover candidate is not a member of this folder");
      (err as Error & { code: string }).code = "GROUP_COVER_NOT_MEMBER";
      throw err;
    }
  }

  await db
    .update(folders)
    .set({ coverImageId: collectionImageId, updatedAt: new Date() })
    .where(eq(folders.id, folderId));
}

// ---------------------------------------------------------------------------
// Image generation inside a group (synchronous)
// ---------------------------------------------------------------------------

export interface GroupImageGenerateInput {
  modelId?: string;
  /** When provided, runs editImageWithModel using these as references. */
  referenceImageIds?: string[];
  prompt: string;
  aspectRatio?: string;
  userAspectRatio?: string;
  imageSize?: ImageGenerationInput["imageSize"];
  quality?: ImageGenerationInput["quality"];
}

/**
 * Generate one image inside an image group. Uploads the result to S3 and
 * inserts a `collection_images` row attached to the folder. Returns the new
 * row. Caller is responsible for permission and credit checks.
 */
export async function generateImageInGroup(
  folderId: string,
  input: GroupImageGenerateInput,
  opts: { chatId?: string | null } = {}
) {
  const [folder] = await db
    .select({
      id: folders.id,
      collectionId: folders.collectionId,
      modality: folders.modality,
    })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);

  if (!folder) {
    const err = new Error("Folder not found");
    (err as Error & { code: string }).code = "GROUP_NOT_FOUND";
    throw err;
  }
  if (folder.modality !== "image") {
    const err = new Error("Folder is not an image group");
    (err as Error & { code: string }).code = "GROUP_MODALITY_MISMATCH";
    throw err;
  }

  const [collection] = await db
    .select({ projectId: collections.projectId })
    .from(collections)
    .where(eq(collections.id, folder.collectionId))
    .limit(1);
  if (!collection) {
    const err = new Error("Parent collection not found");
    (err as Error & { code: string }).code = "GROUP_COLLECTION_MISSING";
    throw err;
  }

  const useEdit = (input.referenceImageIds?.length ?? 0) > 0;

  const result = useEdit
    ? await editImageWithModel(input.modelId, {
        prompt: input.prompt,
        imageIds: input.referenceImageIds,
        aspectRatio: input.aspectRatio,
        userAspectRatio: input.userAspectRatio,
        imageSize: input.imageSize,
        quality: input.quality,
      } satisfies ImageEditInput)
    : await generateImageWithModel(input.modelId, {
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        userAspectRatio: input.userAspectRatio,
        imageSize: input.imageSize,
        quality: input.quality,
      } satisfies ImageGenerationInput);

  const imageId = await uploadImage(result.imageBuffer, result.contentType);

  const [newAsset] = await db
    .insert(collectionImages)
    .values({
      projectId: collection.projectId,
      collectionId: folder.collectionId,
      folderId,
      imageId,
      assetId: imageId,
      assetType: "image",
      chatId: opts.chatId ?? null,
      generationDetails: {
        title: "",
        prompt: input.prompt,
        status: "generated",
        modelId: result.modelId,
        provider: result.provider,
        aspectRatio: input.aspectRatio,
      },
      groupStatus: "candidate",
    })
    .returning();

  // If the folder doesn't yet have a cover, promote this asset.
  await db
    .update(folders)
    .set({ coverImageId: newAsset.id, updatedAt: new Date() })
    .where(and(eq(folders.id, folderId), isNull(folders.coverImageId)));

  return newAsset;
}

// ---------------------------------------------------------------------------
// Video webhook attach-back
// ---------------------------------------------------------------------------

/**
 * After a video generation completes, if the row had `targetFolderId` set,
 * create a `collection_images` row inside that folder so the resulting video
 * shows up as a member of the group. If the folder had no cover yet, promote
 * the new member to cover.
 *
 * Idempotent: silently no-ops if the asset is already attached
 * (matched by `(folderId, assetId=videoId)`).
 *
 * Returns the new collection_images row, or null if nothing was attached
 * (e.g. no targetFolderId, generation not completed, folder gone).
 */
export async function attachVideoToGroup(
  generationId: string
): Promise<{ id: string } | null> {
  const [gen] = await db
    .select({
      id: videoGenerations.id,
      status: videoGenerations.status,
      videoId: videoGenerations.videoId,
      thumbnailImageId: videoGenerations.thumbnailImageId,
      targetFolderId: videoGenerations.targetFolderId,
      modelId: videoGenerations.modelId,
      params: videoGenerations.params,
    })
    .from(videoGenerations)
    .where(eq(videoGenerations.id, generationId))
    .limit(1);

  if (!gen) return null;
  if (!gen.targetFolderId) return null;
  if (gen.status !== "completed" || !gen.videoId) return null;

  const [folder] = await db
    .select({
      id: folders.id,
      collectionId: folders.collectionId,
      modality: folders.modality,
      coverImageId: folders.coverImageId,
    })
    .from(folders)
    .where(eq(folders.id, gen.targetFolderId))
    .limit(1);

  if (!folder || folder.modality !== "video") return null;

  const [coll] = await db
    .select({ projectId: collections.projectId })
    .from(collections)
    .where(eq(collections.id, folder.collectionId))
    .limit(1);
  if (!coll) return null;

  // Idempotency check
  const [existing] = await db
    .select({ id: collectionImages.id })
    .from(collectionImages)
    .where(
      and(
        eq(collectionImages.folderId, folder.id),
        eq(collectionImages.assetId, gen.videoId)
      )
    )
    .limit(1);
  if (existing) return existing;

  const params = (gen.params as Record<string, unknown>) || {};

  const [newAsset] = await db
    .insert(collectionImages)
    .values({
      projectId: coll.projectId,
      collectionId: folder.collectionId,
      folderId: folder.id,
      imageId: gen.thumbnailImageId || gen.videoId,
      assetId: gen.videoId,
      assetType: "video",
      generationDetails: {
        title: "",
        prompt: typeof params.prompt === "string" ? params.prompt : "",
        status: "generated",
        modelId: gen.modelId,
        generationId: gen.id,
      },
      groupStatus: "candidate",
    })
    .returning({ id: collectionImages.id });

  if (!folder.coverImageId) {
    await db
      .update(folders)
      .set({ coverImageId: newAsset.id, updatedAt: new Date() })
      .where(eq(folders.id, folder.id));
  }

  return newAsset;
}

// ---------------------------------------------------------------------------
// Group summary (used by hooks and clients)
// ---------------------------------------------------------------------------

export interface GroupSummary {
  folderId: string;
  modality: GroupModality;
  /** ID of the cover collection_images row, or null if none chosen yet. */
  coverCollectionImageId: string | null;
  /** S3 image ID of the cover (thumbnail for videos), or null. */
  coverImageId: string | null;
  /** Asset type of the cover, or null. */
  coverAssetType: string | null;
}

/**
 * Return modality + cover info for the given folder IDs. Skips folders that
 * aren't groups. Use this to enrich `MediaAssetRef` entries that point at a
 * group, and to render desktop group-asset thumbnails.
 */
export async function getGroupSummaries(
  folderIds: string[]
): Promise<GroupSummary[]> {
  if (folderIds.length === 0) return [];

  const rows = await db
    .select({
      folderId: folders.id,
      modality: folders.modality,
      coverCollectionImageId: folders.coverImageId,
      coverImageS3Id: collectionImages.imageId,
      coverAssetType: collectionImages.assetType,
    })
    .from(folders)
    .leftJoin(
      collectionImages,
      eq(collectionImages.id, folders.coverImageId)
    )
    .where(inArray(folders.id, folderIds));

  return rows
    .filter((r) => r.modality !== null)
    .map((r) => ({
      folderId: r.folderId,
      modality: r.modality as GroupModality,
      coverCollectionImageId: r.coverCollectionImageId,
      coverImageId: r.coverImageS3Id ?? null,
      coverAssetType: r.coverAssetType ?? null,
    }));
}
