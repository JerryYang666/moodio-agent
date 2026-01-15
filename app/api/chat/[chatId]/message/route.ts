import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getChatHistory,
  saveChatHistory,
  getSignedImageUrl,
} from "@/lib/storage/s3";
import { createLLMClient } from "@/lib/llm/client";
import {
  Message,
  MessageContentPart,
  PARALLEL_VARIANT_COUNT,
} from "@/lib/llm/types";
import { agent1 } from "@/lib/agents/agent-1";
import { waitUntil } from "@vercel/functions";
import { recordEvent } from "@/lib/telemetry";

/** Maximum number of images allowed per message */
const MAX_IMAGES_PER_MESSAGE = 5;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const requestStartTime = Date.now();
  console.log("[Perf] Request received", "[0ms]");
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

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      undefined;

    // Parse JSON request - unified format with imageIds array
    // All images are pre-uploaded, we only receive their IDs
    const json = await request.json();
    const content: string = json.content || "";
    const imageIds: string[] = json.imageIds || []; // Unified array of pre-uploaded image IDs
    const precisionEditing: boolean = !!json.precisionEditing;
    const systemPromptOverride: string | undefined = json.systemPromptOverride;
    const aspectRatioOverride: string | undefined = json.aspectRatio;

    // Validate: must have content or images
    if (!content && imageIds.length === 0) {
      return NextResponse.json(
        { error: "Content or imageIds is required" },
        { status: 400 }
      );
    }

    // Validate image count limit
    if (imageIds.length > MAX_IMAGES_PER_MESSAGE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_IMAGES_PER_MESSAGE} images allowed` },
        { status: 400 }
      );
    }

    // Record user sent message event
    await recordEvent(
      "user_sent_message",
      payload.userId,
      {
        chatId,
        content,
        imageCount: imageIds.length,
        imageIds,
        precisionEditing,
        systemPromptOverride,
        aspectRatioOverride,
      },
      ipAddress
    );

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
    console.log(
      "[Perf] Ownership verified",
      `[${Date.now() - requestStartTime}ms]`
    );

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Get existing history
    const history = await getChatHistory(chatId);
    console.log(
      "[Perf] Chat history Got",
      `[${Date.now() - requestStartTime}ms]`
    );

    // Construct new user message with all image IDs
    // Images are already uploaded, we just reference them by ID
    let userMessage: Message;
    if (imageIds.length > 0) {
      const parts: MessageContentPart[] = [];
      if (content) {
        parts.push({ type: "text", text: content });
      }
      // Add all images to the message
      for (const imgId of imageIds) {
        parts.push({ type: "image", imageId: imgId });
      }
      userMessage = {
        role: "user",
        content: parts,
        createdAt: Date.now(),
      };
    } else {
      userMessage = { role: "user", content, createdAt: Date.now() };
    }

    console.log("[Perf] Calling agent", `[${Date.now() - requestStartTime}ms]`);

    // Use Agent 1 with parallel variants
    // Pass all imageIds directly - the agent will use these for image generation
    const { stream: agentStream, completions } =
      await agent1.processRequestParallel(
        history,
        userMessage,
        payload.userId,
        isAdmin ?? false,
        PARALLEL_VARIANT_COUNT,
        requestStartTime,
        precisionEditing,
        imageIds, // Pass the unified array of image IDs
        isAdmin ? systemPromptOverride : undefined,
        aspectRatioOverride
      );

    // Handle background completion (saving history)
    waitUntil(
      completions
        .then(async (finalMessages) => {
          // Create a combined message with variants for storage
          // The first variant becomes the main message, others are stored in variants array
          const timestamp = Date.now();
          const messagesToSave: Message[] = finalMessages.map((msg, idx) => ({
            ...msg,
            createdAt: msg.createdAt || timestamp,
          }));

          // For backward compatibility, store as array of messages with variantId
          // Frontend will group messages with the same timestamp but different variantIds
          const updatedHistory = [...history, userMessage, ...messagesToSave];
          await saveChatHistory(chatId, updatedHistory);

          // Use the first variant for thumbnail calculation
          const primaryMessage = messagesToSave[0];

          // Calculate thumbnail image ID - simplified logic
          // Priority:
          // 1. First image from current user message (most recent user upload/selection)
          // 2. First generated image from assistant response
          // 3. Latest image from history
          let thumbnailImageId: string | null = null;

          // 1. Check current user images
          if (Array.isArray(userMessage.content)) {
            const userImage = userMessage.content.find(
              (c) => c.type === "image"
            );
            if (userImage && "imageId" in userImage) {
              thumbnailImageId = userImage.imageId;
            }
          }

          // 2. Check the primary message for generated images
          if (!thumbnailImageId && Array.isArray(primaryMessage.content)) {
            for (const part of primaryMessage.content) {
              if (
                part.type === "agent_image" &&
                part.imageId &&
                part.status === "generated"
              ) {
                thumbnailImageId = part.imageId;
                break;
              }
            }
          }

          // 3. Fallback: Traverse backwards to find the latest image
          if (!thumbnailImageId) {
            for (let i = updatedHistory.length - 1; i >= 0; i--) {
              const msg = updatedHistory[i];
              if (Array.isArray(msg.content)) {
                for (let j = msg.content.length - 1; j >= 0; j--) {
                  const part = msg.content[j];

                  if (part.type === "image") {
                    thumbnailImageId = part.imageId;
                    break;
                  }

                  if (
                    part.type === "agent_image" &&
                    part.imageId &&
                    part.status === "generated"
                  ) {
                    thumbnailImageId = part.imageId;
                    break;
                  }
                }
              }
              if (thumbnailImageId) break;
            }
          }

          // Generate chat name if needed (check for 1 user message + N variants)
          const isFirstInteraction =
            history.length === 0 &&
            updatedHistory.length === 1 + PARALLEL_VARIANT_COUNT;
          if (isFirstInteraction) {
            const llmClient = createLLMClient({
              apiKey: process.env.LLM_API_KEY,
              provider: "openai",
              model: "gpt-4.1",
            });

            try {
              // Use only the user message and primary variant for name generation
              const messagesForNaming = [userMessage, primaryMessage];
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
                ...messagesForNaming.map((msg) => {
                  if (typeof msg.content === "string") {
                    return msg;
                  }
                  const textContent = msg.content
                    .filter((c) => c.type === "text")
                    .map((c) => (c as { type: "text"; text: string }).text)
                    .join("\n");

                  return {
                    role: msg.role,
                    content: textContent,
                  };
                }),
              ];

              const nameResponse = await llmClient.chatComplete(namePrompt);
              let newChatName = chat.name;

              if (nameResponse) {
                try {
                  const cleanResponse = nameResponse
                    .replace(/```json\n?|```/g, "")
                    .trim();
                  const parsed = JSON.parse(cleanResponse);
                  if (parsed && parsed.chat_name) {
                    newChatName = parsed.chat_name.trim().slice(0, 255);
                  }
                } catch (e) {
                  if (
                    nameResponse.length < 255 &&
                    !nameResponse.includes("{")
                  ) {
                    newChatName = nameResponse.trim();
                  }
                }
              }

              await db
                .update(chats)
                .set({
                  updatedAt: new Date(),
                  name: newChatName,
                  thumbnailImageId,
                })
                .where(eq(chats.id, chatId));
            } catch (err) {
              console.error("Failed to generate chat name:", err);
            }
          } else {
            await db
              .update(chats)
              .set({
                updatedAt: new Date(),
                thumbnailImageId,
              })
              .where(eq(chats.id, chatId));
          }
        })
        .catch((err) => {
          console.error("Agent completion failed:", err);
        })
    );

    return new NextResponse(agentStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // "Transfer-Encoding": "chunked", // Next.js handles this
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
