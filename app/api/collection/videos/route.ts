import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  collectionImages,
  collections,
  collectionShares,
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";

interface CollectionVideo {
  id: string;
  collectionId: string;
  imageId: string;
  assetId: string;
  assetType: string;
  imageUrl: string;
  videoUrl: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: string;
  };
  addedAt: Date;
}

interface CollectionWithVideos {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  permission: "owner" | "collaborator" | "viewer";
  isOwner: boolean;
  videos: CollectionVideo[];
}

/**
 * GET /api/collection/videos
 * Get all collections that contain videos, with their video assets.
 * Returns collections grouped with their videos in a single query.
 * Only returns collections that have at least one video.
 */
export async function GET(req: NextRequest) {
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

    // Step 1: Get all collection IDs the user has access to (owned + shared)
    const ownedCollections = await db
      .select({
        id: collections.id,
        userId: collections.userId,
        projectId: collections.projectId,
        name: collections.name,
        createdAt: collections.createdAt,
        updatedAt: collections.updatedAt,
      })
      .from(collections)
      .where(eq(collections.userId, userId));

    const sharedCollectionsData = await db
      .select({
        id: collections.id,
        userId: collections.userId,
        projectId: collections.projectId,
        name: collections.name,
        createdAt: collections.createdAt,
        updatedAt: collections.updatedAt,
        permission: collectionShares.permission,
      })
      .from(collectionShares)
      .innerJoin(collections, eq(collectionShares.collectionId, collections.id))
      .where(eq(collectionShares.sharedWithUserId, userId));

    // Build a map of collection metadata
    const collectionMap = new Map<string, CollectionWithVideos>();

    for (const col of ownedCollections) {
      collectionMap.set(col.id, {
        ...col,
        permission: "owner" as const,
        isOwner: true,
        videos: [],
      });
    }

    for (const item of sharedCollectionsData) {
      if (!collectionMap.has(item.id)) {
        collectionMap.set(item.id, {
          id: item.id,
          userId: item.userId,
          projectId: item.projectId,
          name: item.name,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          permission: item.permission as "collaborator" | "viewer",
          isOwner: false,
          videos: [],
        });
      }
    }

    const accessibleCollectionIds = Array.from(collectionMap.keys());

    if (accessibleCollectionIds.length === 0) {
      return NextResponse.json({ collections: [] });
    }

    // Step 2: Get all video assets from these collections in a single query
    const videoAssets = await db
      .select()
      .from(collectionImages)
      .where(
        and(
          inArray(collectionImages.collectionId, accessibleCollectionIds),
          eq(collectionImages.assetType, "video"),
          isNotNull(collectionImages.collectionId)
        )
      )
      .orderBy(desc(collectionImages.addedAt));

    // Step 3: Group videos by collection and add URLs
    for (const asset of videoAssets) {
      const collectionId = asset.collectionId;
      if (!collectionId) continue;

      const collection = collectionMap.get(collectionId);
      if (!collection) continue;

      const generationDetails = asset.generationDetails as {
        title?: string;
        prompt?: string;
        status?: string;
        videoUrl?: string;
      };

      collection.videos.push({
        id: asset.id,
        collectionId: collectionId,
        imageId: asset.imageId,
        assetId: asset.assetId,
        assetType: asset.assetType,
        imageUrl: getImageUrl(asset.imageId),
        videoUrl: generationDetails.videoUrl || getVideoUrl(asset.assetId),
        generationDetails: {
          title: generationDetails.title || "",
          prompt: generationDetails.prompt || "",
          status: generationDetails.status || "completed",
        },
        addedAt: asset.addedAt,
      });
    }

    // Step 4: Filter to only collections that have videos and convert to array
    const collectionsWithVideos = Array.from(collectionMap.values())
      .filter((col) => col.videos.length > 0)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return NextResponse.json({ collections: collectionsWithVideos });
  } catch (error) {
    console.error("Error fetching collections with videos:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections with videos" },
      { status: 500 }
    );
  }
}
