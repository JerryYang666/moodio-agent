import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, savePersistentAssets, getImageUrl } from "@/lib/storage/s3";
import {
  PersistentAssets,
  MAX_TEXT_CHUNK_LENGTH,
  MAX_PERSISTENT_REFERENCE_IMAGES,
} from "@/lib/chat/persistent-assets-types";
import { REFERENCE_IMAGE_TAGS, ReferenceImageTag } from "@/components/chat/reference-image-types";

function addImageUrls(assets: PersistentAssets) {
  return {
    ...assets,
    referenceImages: assets.referenceImages.map((img) => ({
      ...img,
      imageUrl: getImageUrl(img.imageId),
    })),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params;
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const [chat] = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, payload.userId)));

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const { persistentAssets } = await getChatHistory(chatId);

    return NextResponse.json({
      persistentAssets: addImageUrls(persistentAssets),
    });
  } catch (error) {
    console.error("Error fetching persistent assets:", error);
    return NextResponse.json(
      { error: "Failed to fetch persistent assets" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params;
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const [chat] = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, payload.userId)));

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const body = await request.json();

    // Validate reference images
    const rawImages = Array.isArray(body.referenceImages)
      ? body.referenceImages
      : [];
    if (rawImages.length > MAX_PERSISTENT_REFERENCE_IMAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PERSISTENT_REFERENCE_IMAGES} reference images allowed` },
        { status: 400 }
      );
    }
    const referenceImages = rawImages
      .filter((img: any) => typeof img?.imageId === "string")
      .map((img: any) => ({
        imageId: img.imageId as string,
        tag: REFERENCE_IMAGE_TAGS.includes(img.tag)
          ? (img.tag as ReferenceImageTag)
          : ("none" as const),
        title: typeof img.title === "string" ? img.title : undefined,
      }));

    // Validate text chunk
    const textChunk =
      typeof body.textChunk === "string"
        ? body.textChunk.slice(0, MAX_TEXT_CHUNK_LENGTH)
        : "";

    const assets: PersistentAssets = { referenceImages, textChunk };

    await savePersistentAssets(chatId, assets);

    return NextResponse.json({
      persistentAssets: addImageUrls(assets),
    });
  } catch (error) {
    console.error("Error saving persistent assets:", error);
    return NextResponse.json(
      { error: "Failed to save persistent assets" },
      { status: 500 }
    );
  }
}
