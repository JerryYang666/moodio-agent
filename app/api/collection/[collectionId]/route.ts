import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  collections,
  collectionImages,
  collectionShares,
  collectionTags,
  folders,
  publicShareLinks,
  type CollectionShare,
  users
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and, desc, sql, ne, isNull } from "drizzle-orm";
import { getImageUrl, getVideoUrl, getAudioUrl } from "@/lib/storage/s3";
import { getContentUrl, getVideoUrl as getPublicVideoUrl } from "@/lib/config/video.config";
import { getUserPermission } from "@/lib/collection-utils";
import { PERMISSION_OWNER, isOwner, type SharePermission } from "@/lib/permissions";
import { TAG_COLOR_MAP } from "@/lib/tag-colors";
import { getUserSetting } from "@/lib/user-settings/server";

/**
 * GET /api/collection/[collectionId]
 * Get collection details with images
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
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
    const { collectionId } = await params;

    // Check permission
    const permission = await getUserPermission(collectionId, userId);
    if (!permission) {
      return NextResponse.json(
        { error: "Collection not found or access denied" },
        { status: 404 }
      );
    }

    // Get collection details
    const [collection] = await db
      .select()
      .from(collections)
      .where(eq(collections.id, collectionId))
      .limit(1);

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    // Get assets (images and videos) directly in collection (not in sub-folders)
    const rawAssets = await db
      .select()
      .from(collectionImages)
      .where(and(eq(collectionImages.collectionId, collectionId), isNull(collectionImages.folderId)))
      .orderBy(desc(collectionImages.addedAt));

    // Add CloudFront URLs to assets
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
      return {
        ...asset,
        imageUrl: getImageUrl(asset.imageId, cnMode),
        videoUrl: asset.assetType === "video" ? getVideoUrl(asset.assetId, cnMode) : undefined,
      };
    });

    // Get top-level folders in this collection
    const topLevelFolders = await db
      .select()
      .from(folders)
      .where(and(eq(folders.collectionId, collectionId), isNull(folders.parentId)))
      .orderBy(folders.sortOrder, folders.name);

    // Get shares if user is owner
    let shares: (CollectionShare & { email: string })[] = [];
    if (isOwner(permission)) {
      const sharesData = await db
        .select({
          id: collectionShares.id,
          collectionId: collectionShares.collectionId,
          sharedWithUserId: collectionShares.sharedWithUserId,
          permission: collectionShares.permission,
          sharedAt: collectionShares.sharedAt,
          email: users.email,
        })
        .from(collectionShares)
        .innerJoin(users, eq(collectionShares.sharedWithUserId, users.id))
        .where(eq(collectionShares.collectionId, collectionId));

      shares = sharesData.map(s => ({
        id: s.id,
        collectionId: s.collectionId,
        sharedWithUserId: s.sharedWithUserId,
        permission: s.permission as SharePermission,
        sharedAt: s.sharedAt,
        email: s.email
      }));
    }

    // Get tags for this collection
    const tags = (
      await db
        .select()
        .from(collectionTags)
        .where(eq(collectionTags.collectionId, collectionId))
        .orderBy(collectionTags.createdAt)
    ).map((t) => ({ id: t.id, label: t.label, color: t.color }));

    return NextResponse.json({
      collection: {
        ...collection,
        permission,
        isOwner: isOwner(permission),
        tags,
      },
      folders: topLevelFolders,
      images,
      shares,
    });
  } catch (error) {
    console.error("Error fetching collection:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/collection/[collectionId]
 * Rename collection (owner only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
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
    const { collectionId } = await params;

    // Check permission (must be owner)
    const permission = await getUserPermission(collectionId, userId);
    if (!isOwner(permission)) {
      return NextResponse.json(
        { error: "Only the owner can rename the collection" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, tags } = body as {
      name?: string;
      tags?: { label: string; color: string }[];
    };

    if (name !== undefined && (!name || typeof name !== "string" || !name.trim())) {
      return NextResponse.json(
        { error: "Collection name is required" },
        { status: 400 }
      );
    }

    // Update collection name if provided
    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (name) {
      const trimmedName = name.trim();

      // Check for duplicate name within the same project (excluding this collection)
      const [currentCol] = await db
        .select({ projectId: collections.projectId })
        .from(collections)
        .where(eq(collections.id, collectionId));

      if (currentCol) {
        const [existing] = await db
          .select({ id: collections.id })
          .from(collections)
          .where(
            and(
              eq(collections.projectId, currentCol.projectId),
              sql`LOWER(${collections.name}) = LOWER(${trimmedName})`,
              ne(collections.id, collectionId)
            )
          )
          .limit(1);

        if (existing) {
          return NextResponse.json(
            { error: "A collection with this name already exists in the project" },
            { status: 409 }
          );
        }
      }

      updatePayload.name = trimmedName;
    }

    const [updatedCollection] = await db
      .update(collections)
      .set(updatePayload)
      .where(eq(collections.id, collectionId))
      .returning();

    // Update tags if provided (replace all)
    let updatedTags: { id: string; label: string; color: string }[] = [];
    if (Array.isArray(tags)) {
      // Delete existing tags
      await db
        .delete(collectionTags)
        .where(eq(collectionTags.collectionId, collectionId));

      // Validate and insert new tags
      const validTags = tags.filter(
        (t) =>
          t &&
          typeof t.label === "string" &&
          t.label.trim() &&
          typeof t.color === "string" &&
          TAG_COLOR_MAP.has(t.color)
      );

      if (validTags.length > 0) {
        updatedTags = (
          await db
            .insert(collectionTags)
            .values(
              validTags.map((t) => ({
                collectionId,
                label: t.label.trim().substring(0, 50),
                color: t.color,
              }))
            )
            .returning()
        ).map((t) => ({ id: t.id, label: t.label, color: t.color }));
      }
    } else {
      // Return current tags if not updating
      updatedTags = (
        await db
          .select()
          .from(collectionTags)
          .where(eq(collectionTags.collectionId, collectionId))
          .orderBy(collectionTags.createdAt)
      ).map((t) => ({ id: t.id, label: t.label, color: t.color }));
    }

    return NextResponse.json({
      collection: {
        ...updatedCollection,
        permission: PERMISSION_OWNER,
        isOwner: true,
        tags: updatedTags,
      },
    });
  } catch (error) {
    console.error("Error updating collection:", error);
    return NextResponse.json(
      { error: "Failed to update collection" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/collection/[collectionId]
 * Delete collection (owner only)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
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
    const { collectionId } = await params;

    // Check permission (must be owner)
    const permission = await getUserPermission(collectionId, userId);
    if (!isOwner(permission)) {
      return NextResponse.json(
        { error: "Only the owner can delete the collection" },
        { status: 403 }
      );
    }

    // Clean up public share link (no FK cascade since resourceId is polymorphic)
    await db.delete(publicShareLinks).where(
      and(
        eq(publicShareLinks.resourceType, "collection"),
        eq(publicShareLinks.resourceId, collectionId)
      )
    );

    // Delete collection (cascade will handle images and shares)
    await db.delete(collections).where(eq(collections.id, collectionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting collection:", error);
    return NextResponse.json(
      { error: "Failed to delete collection" },
      { status: 500 }
    );
  }
}

