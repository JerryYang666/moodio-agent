import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  collectionImages,
  collections,
  collectionShares,
  videoGenerations,
} from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getImageUrl, getVideoUrl } from "@/lib/storage/s3";

// Full video generation details - same structure as /api/video/generations
interface VideoGenerationDetails {
  id: string;
  modelId: string;
  status: string;
  sourceImageId: string;
  sourceImageUrl: string;
  endImageId: string | null;
  endImageUrl: string | null;
  videoId: string | null;
  videoUrl: string | null;
  thumbnailImageId: string | null;
  thumbnailUrl: string | null;
  params: Record<string, any>;
  error: string | null;
  seed: number | null;
  createdAt: Date;
  completedAt: Date | null;
  // Additional fields for collection context
  collectionImageId: string;
  collectionId: string;
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
  videos: VideoGenerationDetails[];
}

/**
 * GET /api/collection/videos
 * Get all collections that contain videos, with full video generation details.
 * Returns collections grouped with their videos in a single query.
 * Only returns collections that have at least one video.
 * 
 * The video details match the structure from /api/video/generations for consistency.
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

    if (videoAssets.length === 0) {
      return NextResponse.json({ collections: [] });
    }

    // Step 3: Get video IDs and fetch full generation details
    const videoIds = videoAssets
      .map((a) => a.assetId)
      .filter((id): id is string => !!id);

    // Fetch video generation records for these video IDs
    const videoGenerationRecords = videoIds.length > 0
      ? await db
          .select()
          .from(videoGenerations)
          .where(inArray(videoGenerations.videoId, videoIds))
      : [];

    // Create a map of videoId -> generation record for quick lookup
    const generationMap = new Map<string, typeof videoGenerationRecords[0]>();
    for (const gen of videoGenerationRecords) {
      if (gen.videoId) {
        generationMap.set(gen.videoId, gen);
      }
    }

    // Step 4: Group videos by collection with full generation details
    for (const asset of videoAssets) {
      const collectionId = asset.collectionId;
      if (!collectionId) continue;

      const collection = collectionMap.get(collectionId);
      if (!collection) continue;

      // Get the full generation record
      const generation = generationMap.get(asset.assetId);

      if (generation) {
        // Use full generation details
        collection.videos.push({
          id: generation.id,
          modelId: generation.modelId,
          status: generation.status,
          sourceImageId: generation.sourceImageId,
          sourceImageUrl: getImageUrl(generation.sourceImageId),
          endImageId: generation.endImageId,
          endImageUrl: generation.endImageId ? getImageUrl(generation.endImageId) : null,
          videoId: generation.videoId,
          videoUrl: generation.videoId ? getVideoUrl(generation.videoId) : null,
          thumbnailImageId: generation.thumbnailImageId,
          thumbnailUrl: generation.thumbnailImageId ? getImageUrl(generation.thumbnailImageId) : null,
          params: generation.params as Record<string, any>,
          error: generation.error,
          seed: generation.seed,
          createdAt: generation.createdAt,
          completedAt: generation.completedAt,
          collectionImageId: asset.id,
          collectionId: collectionId,
        });
      } else {
        // Fallback: construct from collection image data if generation record not found
        // This handles edge cases where video was added but generation record is missing
        const generationDetails = asset.generationDetails as {
          title?: string;
          prompt?: string;
          status?: string;
          videoUrl?: string;
        };

        collection.videos.push({
          id: asset.id, // Use collection image ID as fallback
          modelId: "unknown",
          status: generationDetails.status || "completed",
          sourceImageId: asset.imageId,
          sourceImageUrl: getImageUrl(asset.imageId),
          endImageId: null,
          endImageUrl: null,
          videoId: asset.assetId,
          videoUrl: generationDetails.videoUrl || getVideoUrl(asset.assetId),
          thumbnailImageId: asset.imageId,
          thumbnailUrl: getImageUrl(asset.imageId),
          params: { prompt: generationDetails.prompt || "" },
          error: null,
          seed: null,
          createdAt: asset.addedAt,
          completedAt: null,
          collectionImageId: asset.id,
          collectionId: collectionId,
        });
      }
    }

    // Step 5: Filter to only collections that have videos and convert to array
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
