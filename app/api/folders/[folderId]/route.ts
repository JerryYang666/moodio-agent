import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  folders,
  folderShares,
  collectionImages,
  collections,
  users,
  publicShareLinks,
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and, desc } from "drizzle-orm";
import { getImageUrl, getVideoUrl, getAudioUrl, getThumbnailUrl } from "@/lib/storage/s3";
import {
  getContentUrl,
  getVideoUrl as getPublicVideoUrl,
} from "@/lib/config/video.config";
import {
  getFolderPermission,
  getChildFolders,
} from "@/lib/folder-utils";
import {
  PERMISSION_OWNER,
  isOwner,
  type SharePermission,
} from "@/lib/permissions";
import { getUserSetting } from "@/lib/user-settings/server";

/**
 * GET /api/folders/[folderId]
 * Get folder detail with immediate children (sub-folders + assets)
 */
export async function GET(
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
    const cnMode = await getUserSetting(userId, "cnMode");
    const { folderId } = await params;

    const permission = await getFolderPermission(folderId, userId);
    if (!permission) {
      return NextResponse.json(
        { error: "Folder not found or access denied" },
        { status: 404 }
      );
    }

    const [folder] = await db
      .select()
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1);

    if (!folder) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }

    // Get collection info for context
    const [collection] = await db
      .select({ id: collections.id, name: collections.name, projectId: collections.projectId })
      .from(collections)
      .where(eq(collections.id, folder.collectionId))
      .limit(1);

    // Get immediate child folders
    const childFolders = await getChildFolders(
      folder.collectionId,
      folderId
    );

    // Get assets directly in this folder
    const rawAssets = await db
      .select()
      .from(collectionImages)
      .where(eq(collectionImages.folderId, folderId))
      .orderBy(desc(collectionImages.addedAt));

    const images = rawAssets.map((asset) => {
      if (asset.assetType === "public_video") {
        return {
          ...asset,
          imageUrl: "",
          videoUrl: getPublicVideoUrl(asset.assetId, cnMode),
        };
      }
      if (asset.assetType === "public_image") {
        return {
          ...asset,
          imageUrl: getContentUrl(asset.assetId, cnMode),
          videoUrl: undefined,
        };
      }
      if (asset.assetType === "audio") {
        return {
          ...asset,
          imageUrl: "",
          audioUrl: getAudioUrl(asset.assetId, cnMode),
        };
      }
      if (asset.assetType === "image") {
        return {
          ...asset,
          imageUrl: getImageUrl(asset.imageId, cnMode),
          videoUrl: undefined,
          thumbnailSmUrl: getThumbnailUrl(asset.imageId, "sm", cnMode),
          thumbnailMdUrl: getThumbnailUrl(asset.imageId, "md", cnMode),
        };
      }
      return {
        ...asset,
        imageUrl: getImageUrl(asset.imageId, cnMode),
        videoUrl:
          asset.assetType === "video"
            ? getVideoUrl(asset.assetId, cnMode)
            : undefined,
      };
    });

    // Get shares if user is owner
    let shares: { id: string; folderId: string; sharedWithUserId: string; permission: string; sharedAt: Date; email: string }[] = [];
    if (isOwner(permission)) {
      const sharesData = await db
        .select({
          id: folderShares.id,
          folderId: folderShares.folderId,
          sharedWithUserId: folderShares.sharedWithUserId,
          permission: folderShares.permission,
          sharedAt: folderShares.sharedAt,
          email: users.email,
        })
        .from(folderShares)
        .innerJoin(users, eq(folderShares.sharedWithUserId, users.id))
        .where(eq(folderShares.folderId, folderId));

      shares = sharesData;
    }

    return NextResponse.json({
      folder: {
        ...folder,
        permission,
        isOwner: isOwner(permission),
      },
      collection: collection || null,
      childFolders,
      images,
      shares,
    });
  } catch (error) {
    console.error("Error fetching folder:", error);
    return NextResponse.json(
      { error: "Failed to fetch folder" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/folders/[folderId]
 * Rename folder (owner only)
 */
export async function PATCH(
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

    const permission = await getFolderPermission(folderId, userId);
    if (!isOwner(permission)) {
      return NextResponse.json(
        { error: "Only the owner can rename the folder" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name,
      coverImageId,
      defaultGenerationConfig,
    } = body as {
      name?: string;
      coverImageId?: string | null;
      defaultGenerationConfig?: Record<string, unknown>;
    };

    const updates: Partial<{
      name: string;
      coverImageId: string | null;
      defaultGenerationConfig: Record<string, unknown>;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json(
          { error: "Folder name must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (coverImageId !== undefined) {
      if (coverImageId === null) {
        updates.coverImageId = null;
      } else {
        // Cover must be a member of this folder
        const [member] = await db
          .select({ id: collectionImages.id })
          .from(collectionImages)
          .where(
            and(
              eq(collectionImages.id, coverImageId),
              eq(collectionImages.folderId, folderId)
            )
          )
          .limit(1);
        if (!member) {
          return NextResponse.json(
            { error: "Cover candidate is not a member of this folder" },
            { status: 400 }
          );
        }
        updates.coverImageId = coverImageId;
      }
    }

    if (defaultGenerationConfig !== undefined) {
      if (
        defaultGenerationConfig === null ||
        typeof defaultGenerationConfig !== "object"
      ) {
        return NextResponse.json(
          { error: "defaultGenerationConfig must be an object" },
          { status: 400 }
        );
      }
      updates.defaultGenerationConfig = defaultGenerationConfig;
    }

    if (Object.keys(updates).length === 1) {
      // Only updatedAt — caller sent nothing meaningful.
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    const [updatedFolder] = await db
      .update(folders)
      .set(updates)
      .where(eq(folders.id, folderId))
      .returning();

    return NextResponse.json({
      folder: {
        ...updatedFolder,
        permission: PERMISSION_OWNER,
        isOwner: true,
      },
    });
  } catch (error) {
    console.error("Error renaming folder:", error);
    return NextResponse.json(
      { error: "Failed to rename folder" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/folders/[folderId]
 * Delete folder and all descendants (owner only, cascades via DB)
 */
export async function DELETE(
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

    const permission = await getFolderPermission(folderId, userId);
    if (!isOwner(permission)) {
      return NextResponse.json(
        { error: "Only the owner can delete the folder" },
        { status: 403 }
      );
    }

    // Clean up public share link (no FK cascade since resourceId is polymorphic)
    await db.delete(publicShareLinks).where(
      and(
        eq(publicShareLinks.resourceType, "folder"),
        eq(publicShareLinks.resourceId, folderId)
      )
    );

    await db.delete(folders).where(eq(folders.id, folderId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting folder:", error);
    return NextResponse.json(
      { error: "Failed to delete folder" },
      { status: 500 }
    );
  }
}
