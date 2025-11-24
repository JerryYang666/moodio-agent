import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, saveChatHistory } from "@/lib/storage/s3";

export async function POST(
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

    const json = await request.json();
    const { messageIndex } = json;

    if (typeof messageIndex !== "number" || messageIndex < 0) {
      return NextResponse.json(
        { error: "Invalid message index" },
        { status: 400 }
      );
    }

    // Verify ownership
    const [existingChat] = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, payload.userId)));

    if (!existingChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Get original chat history
    const history = await getChatHistory(chatId);

    // Validate index (must be a user message and not the first one logic handled by frontend, but checking bounds here)
    if (messageIndex >= history.length) {
      return NextResponse.json(
        { error: "Message index out of bounds" },
        { status: 400 }
      );
    }

    // Slice history up to the message before the target index
    // The user wants to edit message at messageIndex, so we keep everything before it.
    const newHistory = history.slice(0, messageIndex);

    // If the last message in newHistory has a selection, clear it
    if (newHistory.length > 0) {
      const lastMsg = newHistory[newHistory.length - 1];
      if (Array.isArray(lastMsg.content)) {
        const newContent = lastMsg.content.map((part) => {
          if (part.type === "agent_image") {
            // Create a copy without isSelected
            const { isSelected, ...rest } = part;
            return rest;
          }
          return part;
        });
        // Update the message in newHistory
        newHistory[newHistory.length - 1] = {
          ...lastMsg,
          content: newContent,
        };
      }
    }

    // Create new chat
    const [newChat] = await db
      .insert(chats)
      .values({
        userId: payload.userId,
        name: `Fork of ${existingChat.name}`,
      })
      .returning();

    // Save truncated history to new chat
    if (newHistory.length > 0) {
      await saveChatHistory(newChat.id, newHistory);
    }

    return NextResponse.json({
      chatId: newChat.id,
      originalMessage: history[messageIndex],
    });
  } catch (error) {
    console.error("Error forking chat:", error);
    return NextResponse.json({ error: "Failed to fork chat" }, { status: 500 });
  }
}
