import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectionImages, collections } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import {
  getFolderPermission,
  getFolder,
  touchFolder,
} from "@/lib/folder-utils";
import { hasWriteAccess } from "@/lib/permissions";
import { assetTypeMatchesModality } from "@/lib/groups/service";

/**
 * POST /api/folders/[folderId]/images
 * Add an asset (image/video) to a folder.
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

    const permission = await getFolderPermission(folderId, userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json(
        { error: "You don't have permission to add assets to this folder" },
        { status: 403 }
      );
    }

    const folder = await getFolder(folderId);
    if (!folder) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }

    // Get projectId from the collection
    const [collection] = await db
      .select({ projectId: collections.projectId })
      .from(collections)
      .where(eq(collections.id, folder.collectionId))
      .limit(1);

    if (!collection) {
      return NextResponse.json(
        { error: "Parent collection not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { imageId, assetId, assetType, chatId, generationDetails } = body;

    if (!imageId || !generationDetails) {
      return NextResponse.json(
        { error: "imageId and generationDetails are required" },
        { status: 400 }
      );
    }

    const resolvedAssetType = assetType || "image";
    const resolvedAssetId = assetId || imageId;

    if ((resolvedAssetType === "video" || resolvedAssetType === "public_video" || resolvedAssetType === "public_image") && !assetId) {
      return NextResponse.json(
        { error: "assetId is required for this asset type" },
        { status: 400 }
      );
    }

    // Group folders are modality-locked: image groups only accept images,
    // video groups only accept videos. Plain folders (modality null) skip this.
    if (folder.modality) {
      if (
        !assetTypeMatchesModality(
          resolvedAssetType,
          folder.modality as "image" | "video"
        )
      ) {
        return NextResponse.json(
          {
            error: `This is a ${folder.modality} group; ${resolvedAssetType} assets cannot be added`,
          },
          { status: 409 }
        );
      }
    }

    // Check for duplicates within the folder
    const [existing] = await db
      .select()
      .from(collectionImages)
      .where(
        and(
          eq(collectionImages.folderId, folderId),
          eq(collectionImages.assetId, resolvedAssetId)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "Asset already exists in this folder" },
        { status: 400 }
      );
    }

    const [newAsset] = await db
      .insert(collectionImages)
      .values({
        projectId: collection.projectId,
        collectionId: folder.collectionId,
        folderId,
        imageId,
        assetId: resolvedAssetId,
        assetType: resolvedAssetType,
        chatId: chatId || null,
        generationDetails,
      })
      .returning();

    await touchFolder(folderId);

    return NextResponse.json({ image: newAsset });
  } catch (error) {
    console.error("Error adding asset to folder:", error);
    return NextResponse.json(
      { error: "Failed to add asset to folder" },
      { status: 500 }
    );
  }
}
