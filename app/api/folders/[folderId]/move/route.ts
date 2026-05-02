import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders, collections, collectionImages } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, sql } from "drizzle-orm";
import {
  getFolderPermission,
  getFolder,
  getFolderWithProject,
  uuidToLtreeLabel,
  validateDepth,
} from "@/lib/folder-utils";
import { getUserPermission } from "@/lib/collection-utils";
import { isOwner, hasWriteAccess } from "@/lib/permissions";

/**
 * POST /api/folders/[folderId]/move
 * Move a folder to a new parent folder or to the root of a (possibly different) collection.
 * Supports cross-collection moves within the same project.
 *
 * Body: { targetFolderId?: string, targetCollectionId?: string }
 * - targetFolderId: move into another folder (derives collection from target)
 * - targetCollectionId: move to root of a collection (no parent folder)
 * - Exactly one must be provided.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = payload.userId;
    const { folderId } = await params;

    const body = await req.json();
    const { targetFolderId, targetCollectionId } = body as {
      targetFolderId?: string;
      targetCollectionId?: string;
    };

    if (!targetFolderId && !targetCollectionId) {
      return NextResponse.json(
        { error: "Either targetFolderId or targetCollectionId is required" },
        { status: 400 }
      );
    }

    if (targetFolderId && targetCollectionId) {
      return NextResponse.json(
        { error: "Provide only one of targetFolderId or targetCollectionId" },
        { status: 400 }
      );
    }

    // Must be owner of the folder being moved
    const permission = await getFolderPermission(folderId, userId);
    if (!isOwner(permission)) {
      return NextResponse.json(
        { error: "Only the owner can move the folder" },
        { status: 403 }
      );
    }

    const sourceData = await getFolderWithProject(folderId);
    if (!sourceData) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }

    const { folder: sourceFolder, projectId: sourceProjectId } = sourceData;

    let newParentId: string | null = null;
    let newParentPath: string | null = null;
    let newParentDepth = -1;
    let newCollectionId = sourceFolder.collectionId;

    if (targetFolderId) {
      // Cannot move into self
      if (targetFolderId === folderId) {
        return NextResponse.json(
          { error: "Cannot move a folder into itself" },
          { status: 400 }
        );
      }

      const targetData = await getFolderWithProject(targetFolderId);
      if (!targetData) {
        return NextResponse.json(
          { error: "Target folder not found" },
          { status: 404 }
        );
      }

      // Must be same project
      if (targetData.projectId !== sourceProjectId) {
        return NextResponse.json(
          { error: "Cannot move folders across projects" },
          { status: 400 }
        );
      }

      // Groups are leaf containers — no nesting folders inside a group.
      if (targetData.folder.modality) {
        return NextResponse.json(
          { error: "Cannot move a folder into a group" },
          { status: 400 }
        );
      }

      // Cannot move into own descendant (check if target path starts with source path)
      if (
        targetData.folder.path === sourceFolder.path ||
        targetData.folder.path.startsWith(sourceFolder.path + ".")
      ) {
        return NextResponse.json(
          { error: "Cannot move a folder into its own descendant" },
          { status: 400 }
        );
      }

      // Need write access on target
      const targetPermission = await getFolderPermission(targetFolderId, userId);
      if (!hasWriteAccess(targetPermission)) {
        return NextResponse.json(
          { error: "You don't have permission to move into the target folder" },
          { status: 403 }
        );
      }

      if (!validateDepth(targetData.folder.depth)) {
        return NextResponse.json(
          { error: "Maximum folder nesting depth exceeded" },
          { status: 400 }
        );
      }

      newParentId = targetFolderId;
      newParentPath = targetData.folder.path;
      newParentDepth = targetData.folder.depth;
      newCollectionId = targetData.folder.collectionId;
    } else {
      // Moving to collection root
      const [targetCollection] = await db
        .select({ id: collections.id, projectId: collections.projectId })
        .from(collections)
        .where(eq(collections.id, targetCollectionId!))
        .limit(1);

      if (!targetCollection) {
        return NextResponse.json(
          { error: "Target collection not found" },
          { status: 404 }
        );
      }

      if (targetCollection.projectId !== sourceProjectId) {
        return NextResponse.json(
          { error: "Cannot move folders across projects" },
          { status: 400 }
        );
      }

      const collectionPermission = await getUserPermission(
        targetCollectionId!,
        userId
      );
      if (!hasWriteAccess(collectionPermission)) {
        return NextResponse.json(
          { error: "You don't have permission to move into the target collection" },
          { status: 403 }
        );
      }

      newParentId = null;
      newParentPath = null;
      newParentDepth = -1;
      newCollectionId = targetCollectionId!;
    }

    const oldPath = sourceFolder.path;
    const oldDepth = sourceFolder.depth;
    const selfLabel = uuidToLtreeLabel(folderId);
    const newSelfPath = newParentPath
      ? `${newParentPath}.${selfLabel}`
      : selfLabel;
    const newDepth = newParentDepth + 1;
    const depthDelta = newDepth - oldDepth;
    const isCrossCollection = newCollectionId !== sourceFolder.collectionId;

    // Use raw SQL for ltree operations -- update all descendants atomically
    // The path rewrite: replace the old prefix with the new prefix
    await db.execute(sql`
      UPDATE folders
      SET
        path = ${sql.raw(`'${newSelfPath}'`)}::ltree || subpath(path, nlevel(${sql.raw(`'${oldPath}'`)}::ltree)),
        depth = depth + ${depthDelta},
        parent_id = CASE WHEN id = ${folderId}::uuid THEN ${newParentId}::uuid ELSE parent_id END,
        collection_id = CASE WHEN ${isCrossCollection} THEN ${newCollectionId}::uuid ELSE collection_id END,
        updated_at = NOW()
      WHERE path <@ ${sql.raw(`'${oldPath}'`)}::ltree
    `);

    // If cross-collection, also update assets in the subtree
    if (isCrossCollection) {
      await db.execute(sql`
        UPDATE collection_images
        SET collection_id = ${newCollectionId}::uuid
        WHERE folder_id IN (
          SELECT id FROM folders WHERE path <@ ${sql.raw(`'${newSelfPath}'`)}::ltree
        )
      `);
    }

    const movedFolder = await getFolder(folderId);

    return NextResponse.json({
      success: true,
      folder: movedFolder,
    });
  } catch (error) {
    console.error("Error moving folder:", error);
    return NextResponse.json(
      { error: "Failed to move folder" },
      { status: 500 }
    );
  }
}
