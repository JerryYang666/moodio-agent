import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, getImageUrl } from "@/lib/storage/s3";

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

    // Verify ownership or admin status
    const isAdmin = payload.roles?.includes("admin");
    let chat;

    if (isAdmin) {
      [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
    } else {
      [chat] = await db
        .select()
        .from(chats)
        .where(and(eq(chats.id, chatId), eq(chats.userId, payload.userId)));
    }

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const messages = await getChatHistory(chatId);

    // Filter out internal_* for non-admins and add CloudFront URLs for images
    const processedMessages = messages.map((msg) => {
      if (typeof msg.content === "string") return msg;

      const processedContent = msg.content
        .filter((part) => isAdmin || !part.type.startsWith("internal_"))
        .map((part) => {
          // Add CloudFront URL for agent_image parts
          if (part.type === "agent_image" && part.imageId && !part.imageUrl) {
            return {
              ...part,
              imageUrl: getImageUrl(part.imageId),
            };
          }
          // Add CloudFront URL for image parts (user uploaded images)
          if (part.type === "image" && part.imageId) {
            return {
              ...part,
              imageUrl: getImageUrl(part.imageId),
            };
          }
          return part;
        });

      return {
        ...msg,
        content: processedContent,
      };
    });

    return NextResponse.json({ chat, messages: processedMessages });
  } catch (error) {
    console.error("Error fetching chat:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const body = await request.json();
    const { name, deleted } = body;

    // Verify ownership
    const [chat] = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, payload.userId)));

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Handle soft delete
    if (deleted === true) {
      await db
        .update(chats)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(chats.id, chatId));
      return NextResponse.json({ success: true, deleted: true });
    }

    // Handle rename
    if (name !== undefined) {
      if (!name || typeof name !== "string") {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      await db
        .update(chats)
        .set({ name, updatedAt: new Date() })
        .where(eq(chats.id, chatId));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "No valid update provided" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating chat:", error);
    return NextResponse.json(
      { error: "Failed to update chat" },
      { status: 500 }
    );
  }
}
