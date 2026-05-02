import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders, collectionImages } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getFolderPermission } from "@/lib/folder-utils";
import { getImageUrl, getThumbnailUrl } from "@/lib/storage/s3";
import { getUserSetting } from "@/lib/user-settings/server";

/**
 * GET /api/folders/[folderId]/summary
 *
 * Lightweight read used by clients that need to render a group preview
 * (cover thumbnail + member count) without paying for the full member list.
 * Used by MediaCell to keep its cell thumbnail in sync as the underlying
 * group mutates in real time.
 *
 * Returns:
 *   {
 *     folderId, name, modality,
 *     coverCollectionImageId,         // collection_images.id of the cover
 *     coverImageId,                   // S3 image ID (sm thumb available)
 *     coverImageUrl,
 *     coverThumbnailSmUrl,
 *     memberCount,
 *   }
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
      .select({
        id: folders.id,
        name: folders.name,
        modality: folders.modality,
        coverImageId: folders.coverImageId,
      })
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1);

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    let coverImageS3Id: string | null = null;
    if (folder.coverImageId) {
      const [cover] = await db
        .select({ imageId: collectionImages.imageId })
        .from(collectionImages)
        .where(eq(collectionImages.id, folder.coverImageId))
        .limit(1);
      coverImageS3Id = cover?.imageId ?? null;
    }

    if (!coverImageS3Id) {
      // Fallback: pick the most recent member as implicit cover.
      const [first] = await db
        .select({ imageId: collectionImages.imageId })
        .from(collectionImages)
        .where(eq(collectionImages.folderId, folderId))
        .orderBy(collectionImages.addedAt)
        .limit(1);
      coverImageS3Id = first?.imageId ?? null;
    }

    const [{ value: memberCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(collectionImages)
      .where(eq(collectionImages.folderId, folderId));

    return NextResponse.json({
      folderId: folder.id,
      name: folder.name,
      modality: folder.modality,
      coverCollectionImageId: folder.coverImageId,
      coverImageId: coverImageS3Id,
      coverImageUrl: coverImageS3Id ? getImageUrl(coverImageS3Id, cnMode) : null,
      coverThumbnailSmUrl: coverImageS3Id
        ? getThumbnailUrl(coverImageS3Id, "sm", cnMode)
        : null,
      memberCount: Number(memberCount) || 0,
    });
  } catch (error) {
    console.error("Error fetching folder summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch folder summary" },
      { status: 500 }
    );
  }
}
