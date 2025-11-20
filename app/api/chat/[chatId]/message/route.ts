import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, saveChatHistory } from "@/lib/storage/s3";
import { createLLMClient } from "@/lib/llm/client";
import { Message } from "@/lib/llm/types";

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

    const { content } = await request.json();
    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const [chat] = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, payload.userId)));

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Get existing history
    const history = await getChatHistory(chatId);

    // Construct new messages
    const userMessage: Message = { role: "user", content };
    const messagesForLLM = [...history, userMessage];

    // Initialize LLM Client
    const llmClient = createLLMClient({
      apiKey: process.env.LLM_API_KEY,
      provider: "openai",
      model: "gpt-5-mini",
    });

    // Create a stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullResponse = "";

        try {
          const iterator = llmClient.chat(messagesForLLM);

          for await (const chunk of iterator) {
            if (chunk.content) {
              fullResponse += chunk.content;
              controller.enqueue(encoder.encode(chunk.content));
            }
          }

          // After streaming is complete, save to S3 and DB
          const assistantMessage: Message = {
            role: "assistant",
            content: fullResponse,
          };

          const updatedHistory = [...messagesForLLM, assistantMessage];
          await saveChatHistory(chatId, updatedHistory);

          await db
            .update(chats)
            .set({ updatedAt: new Date() })
            .where(eq(chats.id, chatId));

          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.error(error);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
