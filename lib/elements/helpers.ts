import { db } from "@/lib/db";
import { collections, folders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getUserPermission,
  hasWritePermission,
} from "@/lib/collection-utils";
import {
  getFolderPermission,
  hasFolderWritePermission,
} from "@/lib/folder-utils";
import {
  getProjectPermission,
  hasProjectWritePermission,
} from "@/lib/project-utils";

export const MAX_ELEMENT_IMAGES = 4;
export const MAX_NAME_LEN = 255;
export const MAX_DESCRIPTION_LEN = 4000;
export const MAX_VOICE_ID_LEN = 255;

export function parseStringArray(
  value: unknown,
  max: number
): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > max) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") return null;
    out.push(v);
  }
  return out;
}

export function buildElementDetails(input: {
  imageIds: string[];
  videoId?: string | null;
  voiceId?: string | null;
}) {
  const details: Record<string, unknown> = { imageIds: input.imageIds };
  if (input.videoId) details.videoId = input.videoId;
  if (input.voiceId) {
    details.voiceId = input.voiceId;
    details.voiceProvider = "fal";
  }
  return details;
}

/** Write permission check that walks folder → collection → project. */
export async function resolveDestinationPermission(args: {
  userId: string;
  projectId: string;
  collectionId: string | null;
  folderId: string | null;
}): Promise<boolean> {
  const { userId, projectId, collectionId, folderId } = args;

  if (folderId) {
    const perm = await getFolderPermission(folderId, userId);
    return hasFolderWritePermission(perm);
  }
  if (collectionId) {
    const perm = await getUserPermission(collectionId, userId);
    return hasWritePermission(perm);
  }
  const perm = await getProjectPermission(projectId, userId);
  return hasProjectWritePermission(perm);
}

/** Verify the (projectId, collectionId, folderId) tuple is internally consistent. */
export async function validateDestinationTuple(args: {
  projectId: string;
  collectionId: string | null;
  folderId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { projectId, collectionId, folderId } = args;

  if (folderId) {
    const [folder] = await db
      .select({ collectionId: folders.collectionId })
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1);
    if (!folder) return { ok: false, error: "Folder not found", status: 404 };
    if (collectionId && folder.collectionId !== collectionId) {
      return {
        ok: false,
        error: "Folder does not belong to the given collection",
        status: 400,
      };
    }
  }
  if (collectionId) {
    const [collection] = await db
      .select({ projectId: collections.projectId })
      .from(collections)
      .where(eq(collections.id, collectionId))
      .limit(1);
    if (!collection)
      return { ok: false, error: "Collection not found", status: 404 };
    if (collection.projectId !== projectId) {
      return {
        ok: false,
        error: "Collection does not belong to the given project",
        status: 400,
      };
    }
  }
  return { ok: true };
}
