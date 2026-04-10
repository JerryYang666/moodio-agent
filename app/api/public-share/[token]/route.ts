import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  publicShareLinks,
  collections,
  folders,
  collectionImages,
  users,
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and, desc, or } from "drizzle-orm";
import { getSignedImageUrl, getSignedVideoUrl, getSignedAudioUrl } from "@/lib/storage/s3";
import {
  getContentUrl,
  getVideoUrl as getPublicVideoUrl,
} from "@/lib/config/video.config";
import { getUserPermission } from "@/lib/collection-utils";
import { getFolderPermission } from "@/lib/folder-utils";
import { hasWriteAccess } from "@/lib/permissions";

const SIGNED_URL_EXPIRY = 1800; // 30 minutes
const PAGE_SIZE = 50;

const NOT_FOUND_RESPONSE = NextResponse.json(
  { error: "Share link not found" },
  {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  }
);

interface AssetRow {
  id: string;
  imageId: string;
  assetId: string;
  assetType: string;
}

function buildAssetUrls(asset: AssetRow) {
  if (asset.assetType === "public_video") {
    return {
      imageUrl: "",
      videoUrl: getPublicVideoUrl(asset.assetId),
    };
  }
  if (asset.assetType === "public_image") {
    return {
      imageUrl: getContentUrl(asset.assetId),
      videoUrl: undefined,
    };
  }
  if (asset.assetType === "audio") {
    return {
      imageUrl: "",
      videoUrl: undefined,
      audioUrl: getSignedAudioUrl(asset.assetId, SIGNED_URL_EXPIRY),
    };
  }
  return {
    imageUrl: getSignedImageUrl(asset.imageId, SIGNED_URL_EXPIRY),
    videoUrl:
      asset.assetType === "video"
        ? getSignedVideoUrl(asset.assetId, SIGNED_URL_EXPIRY)
        : undefined,
  };
}


/**
 * Recursively collect all folder IDs under a collection.
 */
async function getAllFolderIdsInCollection(collectionId: string): Promise<string[]> {
  const allFolders = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.collectionId, collectionId));
  return allFolders.map((f) => f.id);
}

/**
 * Recursively collect all descendant folder IDs under a given folder.
 */
async function getDescendantFolderIds(folderId: string): Promise<string[]> {
  const [folder] = await db
    .select({ collectionId: folders.collectionId, path: folders.path })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);

  if (!folder) return [];

  const allFolders = await db
    .select({ id: folders.id, path: folders.path })
    .from(folders)
    .where(eq(folders.collectionId, folder.collectionId));

  const prefix = folder.path + ".";
  return allFolders
    .filter((f) => f.path.startsWith(prefix))
    .map((f) => f.id);
}

/**
 * GET /api/public-share/[token]
 * Fetch public shared content. NO authentication required.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || typeof token !== "string" || token.length !== 64 || !/^[0-9a-f]+$/i.test(token)) {
      return NOT_FOUND_RESPONSE;
    }

    const [shareLink] = await db
      .select()
      .from(publicShareLinks)
      .where(eq(publicShareLinks.token, token))
      .limit(1);

    // Identical response for not-found and disabled (anti-oracle)
    if (!shareLink || !shareLink.isActive) {
      return NOT_FOUND_RESPONSE;
    }

    // Verify the underlying resource still exists
    let resourceName = "";
    let ownerName = "";

    if (shareLink.resourceType === "collection") {
      const [collection] = await db
        .select({ id: collections.id, name: collections.name, userId: collections.userId })
        .from(collections)
        .where(eq(collections.id, shareLink.resourceId))
        .limit(1);

      if (!collection) return NOT_FOUND_RESPONSE;
      resourceName = collection.name;

      const [owner] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, collection.userId))
        .limit(1);

      ownerName = owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Moodio User" : "Moodio User";
    } else {
      const [folder] = await db
        .select({ id: folders.id, name: folders.name, userId: folders.userId })
        .from(folders)
        .where(eq(folders.id, shareLink.resourceId))
        .limit(1);

      if (!folder) return NOT_FOUND_RESPONSE;
      resourceName = folder.name;

      const [owner] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, folder.userId))
        .limit(1);

      ownerName = owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Moodio User" : "Moodio User";
    }

    // Pagination
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const offset = (page - 1) * PAGE_SIZE;

    // Load assets
    let rawAssets: AssetRow[];
    let totalAssets: number;

    if (shareLink.resourceType === "collection") {
      // All assets in the collection (including subfolders)
      const allAssets = await db
        .select({
          id: collectionImages.id,
          imageId: collectionImages.imageId,
          assetId: collectionImages.assetId,
          assetType: collectionImages.assetType,
        })
        .from(collectionImages)
        .where(eq(collectionImages.collectionId, shareLink.resourceId))
        .orderBy(desc(collectionImages.addedAt));

      totalAssets = allAssets.length;
      rawAssets = allAssets.slice(offset, offset + PAGE_SIZE);
    } else {
      // Assets in this folder + all descendant folders
      const descendantIds = await getDescendantFolderIds(shareLink.resourceId);
      const allFolderIds = [shareLink.resourceId, ...descendantIds];

      const allAssets = await db
        .select({
          id: collectionImages.id,
          imageId: collectionImages.imageId,
          assetId: collectionImages.assetId,
          assetType: collectionImages.assetType,
        })
        .from(collectionImages)
        .where(
          allFolderIds.length === 1
            ? eq(collectionImages.folderId, allFolderIds[0])
            : or(...allFolderIds.map((id) => eq(collectionImages.folderId, id)))
        )
        .orderBy(desc(collectionImages.addedAt));

      totalAssets = allAssets.length;
      rawAssets = allAssets.slice(offset, offset + PAGE_SIZE);
    }

    const assets = rawAssets.map((asset) => {
      const urls = buildAssetUrls(asset);
      return {
        id: asset.id,
        imageUrl: urls.imageUrl,
        videoUrl: urls.videoUrl,
        assetType: asset.assetType,
      };
    });

    const totalPages = Math.max(1, Math.ceil(totalAssets / PAGE_SIZE));

    return NextResponse.json(
      {
        name: resourceName,
        resourceType: shareLink.resourceType,
        ownerName,
        assets,
        pagination: {
          page,
          totalPages,
          totalAssets,
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Error fetching public share:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * DELETE /api/public-share/[token]
 * Deactivate a public share link (auth required, write-access only).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
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

    const origin = req.headers.get("origin");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    if (origin && appUrl && !appUrl.startsWith(origin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { token } = await params;

    const [shareLink] = await db
      .select()
      .from(publicShareLinks)
      .where(eq(publicShareLinks.token, token))
      .limit(1);

    if (!shareLink) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const permission =
      shareLink.resourceType === "collection"
        ? await getUserPermission(shareLink.resourceId, payload.userId)
        : await getFolderPermission(shareLink.resourceId, payload.userId);

    if (!hasWriteAccess(permission)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [updated] = await db
      .update(publicShareLinks)
      .set({ isActive: false })
      .where(eq(publicShareLinks.id, shareLink.id))
      .returning();

    return NextResponse.json({
      token: updated.token,
      isActive: updated.isActive,
      url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/share/${updated.token}`,
    });
  } catch (error) {
    console.error("Error deactivating public share:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
