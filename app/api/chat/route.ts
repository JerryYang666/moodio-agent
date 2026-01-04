import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, desc, isNull, and } from "drizzle-orm";
import { getSignedImageUrl } from "@/lib/storage/s3";

// Create a new chat
export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const [newChat] = await db
      .insert(chats)
      .values({
        userId: payload.userId,
        name: "New Chat", // Default name, explicitly set
      })
      .returning();

    return NextResponse.json({ chat: newChat });
  } catch (error) {
    console.error("Error creating chat:", error);
    return NextResponse.json(
      { error: "Failed to create chat" },
      { status: 500 }
    );
  }
}

// List chats
export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Only fetch non-deleted chats (deletedAt is null)
    const userChats = await db
      .select()
      .from(chats)
      .where(and(eq(chats.userId, payload.userId), isNull(chats.deletedAt)))
      .orderBy(desc(chats.updatedAt));

    // Add signed CloudFront URLs for thumbnails
    const chatsWithUrls = userChats.map((chat) => ({
      ...chat,
      thumbnailImageUrl: chat.thumbnailImageId
        ? getSignedImageUrl(chat.thumbnailImageId)
        : null,
    }));

    return NextResponse.json({ chats: chatsWithUrls });
  } catch (error) {
    console.error("Error listing chats:", error);
    return NextResponse.json(
      { error: "Failed to list chats" },
      { status: 500 }
    );
  }
}
