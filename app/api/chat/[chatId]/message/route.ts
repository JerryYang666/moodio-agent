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

    // Verify ownership or admin status
    const isAdmin = payload.roles?.includes("admin");
    let chat;

    if (isAdmin) {
      [chat] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, chatId));
    } else {
      [chat] = await db
        .select()
        .from(chats)
        .where(and(eq(chats.id, chatId), eq(chats.userId, payload.userId)));
    }

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

          // Generate chat name if this is the first conversation round (User + Assistant = 2 messages)
          // Note: updatedHistory includes the new user message and assistant response
          let newChatName = chat.name;

          // If we just completed the first round (user msg + assistant msg)
          // We check if history was empty before (length was 0), so new history length should be 2
          if (history.length === 0 && updatedHistory.length === 2) {
            try {
              const namePrompt: Message[] = [
                {
                  role: "system",
                  content:
                    "You are a helpful assistant that generates concise names for chat sessions. " +
                    "Based on the first two messages of a conversation, generate a short, descriptive name. " +
                    "The name MUST be very concise and no longer than 50 characters. " +
                    "Give the name in the same language as the messages. " +
                    'Output JSON only. Format: {"chat_name": "Your Chat Name"}',
                },
                ...updatedHistory,
              ];

              const nameResponse = await llmClient.chatComplete(namePrompt);
              if (nameResponse) {
                try {
                  // Attempt to parse JSON, handling potential code block wrappers
                  const cleanResponse = nameResponse
                    .replace(/```json\n?|```/g, "")
                    .trim();
                  const parsed = JSON.parse(cleanResponse);
                  if (parsed && parsed.chat_name) {
                    newChatName = parsed.chat_name.trim().slice(0, 255);
                  }
                } catch (e) {
                  console.warn(
                    "Failed to parse chat name JSON, using raw response fallback",
                    e
                  );
                  // Fallback: if JSON parse fails, use raw response if it looks like a name
                  // but since we asked for JSON, it might be safer to just ignore or cleanup
                  if (
                    nameResponse.length < 255 &&
                    !nameResponse.includes("{")
                  ) {
                    newChatName = nameResponse.trim();
                  }
                }
              }
            } catch (err) {
              console.error("Failed to generate chat name:", err);
              // Fallback or keep null, handled gracefully
            }
          }

          await db
            .update(chats)
            .set({
              updatedAt: new Date(),
              name: newChatName,
            })
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
