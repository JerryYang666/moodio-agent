import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, saveChatHistory } from "@/lib/storage/s3";
import { createLLMClient } from "@/lib/llm/client";
import { Message, MessageContentPart } from "@/lib/llm/types";
import { agent1 } from "@/lib/agents/agent-1";
import { waitUntil } from "@vercel/functions";
import { recordEvent } from "@/lib/telemetry";

/** Maximum number of images allowed per message */
const MAX_IMAGES_PER_MESSAGE = 5;

type ImageSourceEntry = {
  imageId: string;
  source?: "upload" | "asset" | "ai_generated";
  title?: string;
  messageIndex?: number;
  partIndex?: number;
  variantId?: string;
};

type ReferenceImageEntry = {
  imageId: string;
  tag: "none" | "subject" | "scene" | "item" | "style";
  title?: string;
};

const applyImageSelections = (
  history: Message[],
  imageSources: ImageSourceEntry[]
): Message[] => {
  const selections = imageSources.filter(
    (entry) => entry.source === "ai_generated"
  );
  if (selections.length === 0) return history;

  const updated = [...history];

  for (const selection of selections) {
    let targetIndex = -1;
    if (selection.variantId) {
      targetIndex = updated.findIndex(
        (msg) => msg.variantId === selection.variantId
      );
    }
    if (targetIndex === -1 && typeof selection.messageIndex === "number") {
      targetIndex = selection.messageIndex;
    }

    // Fallback: find by imageId
    if (targetIndex === -1 && selection.imageId) {
      targetIndex = updated.findIndex((msg) => {
        if (!Array.isArray(msg.content)) return false;
        return msg.content.some(
          (part) =>
            part.type === "agent_image" && part.imageId === selection.imageId
        );
      });
    }

    if (targetIndex < 0 || targetIndex >= updated.length) continue;
    const target = updated[targetIndex];
    if (!Array.isArray(target.content)) continue;

    const content = [...target.content];
    let partIndex = content.findIndex(
      (part) =>
        part.type === "agent_image" && part.imageId === selection.imageId
    );

    if (
      partIndex === -1 &&
      typeof selection.partIndex === "number" &&
      selection.partIndex >= 0 &&
      selection.partIndex < content.length
    ) {
      partIndex = selection.partIndex;
    }

    const part = content[partIndex];
    if (part && part.type === "agent_image" && !part.isSelected) {
      content[partIndex] = { ...part, isSelected: true };
      updated[targetIndex] = { ...target, content };
    }
  }

  return updated;
};

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
    const rawImageSources = Array.isArray(json.imageSources)
      ? json.imageSources
      : [];
    const imageSources: ImageSourceEntry[] = rawImageSources
      .filter((entry: any) => typeof entry?.imageId === "string")
      .map((entry: any) => ({
        imageId: entry.imageId as string,
        source:
          entry.source === "upload" ||
            entry.source === "asset" ||
            entry.source === "ai_generated"
            ? (entry.source as "upload" | "asset" | "ai_generated")
            : undefined,
        title: typeof entry.title === "string" ? entry.title : undefined,
        messageIndex:
          typeof entry.messageIndex === "number"
            ? entry.messageIndex
            : undefined,
        partIndex:
          typeof entry.partIndex === "number" ? entry.partIndex : undefined,
        variantId:
          typeof entry.variantId === "string" ? entry.variantId : undefined,
      }));
    const precisionEditing: boolean = !!json.precisionEditing;
    const systemPromptOverride: string | undefined = json.systemPromptOverride;
    const aspectRatioOverride: string | undefined = json.aspectRatio;
    const imageSizeOverride: "2k" | "4k" | undefined =
      json.imageSize === "2k" || json.imageSize === "4k"
        ? json.imageSize
        : undefined;
    const imageModelId: string | undefined =
      typeof json.imageModelId === "string" ? json.imageModelId : undefined;
    // Accept optional variantCount parameter, default to 1 (lazy variant generation)
    const variantCount: number =
      typeof json.variantCount === "number" && json.variantCount >= 1
        ? Math.min(json.variantCount, 4) // Cap at 4 variants max
        : 1;
    // Parse reference images with their tags
    const rawReferenceImages = Array.isArray(json.referenceImages)
      ? json.referenceImages
      : [];
    const referenceImages: ReferenceImageEntry[] = rawReferenceImages
      .filter((entry: any) => typeof entry?.imageId === "string")
      .map((entry: any) => ({
        imageId: entry.imageId as string,
        tag:
          entry.tag === "none" ||
          entry.tag === "subject" ||
          entry.tag === "scene" ||
          entry.tag === "item" ||
          entry.tag === "style"
            ? (entry.tag as ReferenceImageEntry["tag"])
            : "none",
        title: typeof entry.title === "string" ? entry.title : undefined,
      }));

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
        imageSources,
        referenceImages,
        precisionEditing,
        systemPromptOverride,
        aspectRatioOverride,
        imageSizeOverride,
        imageModelId,
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
      const sourceById = new Map<string, ImageSourceEntry>(
        imageSources.map((entry) => [entry.imageId, entry])
      );
      const parts: MessageContentPart[] = [];
      if (content) {
        parts.push({ type: "text", text: content });
      }
      // Add all images to the message (including title for pre-select feature)
      for (const imgId of imageIds) {
        const sourceEntry = sourceById.get(imgId);
        parts.push({
          type: "image",
          imageId: imgId,
          source: sourceEntry?.source,
          title: sourceEntry?.title,
        });
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

    // Generate a timestamp for all variants - this will be synced with frontend
    const messageTimestamp = Date.now();

    // Use Agent 1 with parallel variants
    // Pass all imageIds directly - the agent will use these for image generation
    const { stream: agentStream, completions } =
      await agent1.processRequestParallel(
        history,
        userMessage,
        payload.userId,
        isAdmin ?? false,
        variantCount, // Use dynamic variant count (default: 1)
        requestStartTime,
        precisionEditing,
        imageIds, // Pass the unified array of image IDs
        isAdmin ? systemPromptOverride : undefined,
        aspectRatioOverride,
        imageSizeOverride,
        imageModelId,
        messageTimestamp, // Pass timestamp for frontend sync
        referenceImages // Pass reference images with tags
      );

    // Handle background completion (saving history)
    waitUntil(
      completions
        .then(async (finalMessages) => {
          // Messages already have createdAt set to messageTimestamp by the agent
          const messagesToSave: Message[] = finalMessages.map((msg) => ({
            ...msg,
            createdAt: msg.createdAt || messageTimestamp,
          }));

          // For backward compatibility, store as array of messages with variantId
          // Frontend will group messages with the same timestamp but different variantIds
          const historyWithSelections = applyImageSelections(
            history,
            imageSources
          );
          const updatedHistory = [
            ...historyWithSelections,
            userMessage,
            ...messagesToSave,
          ];
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
            updatedHistory.length === 1 + variantCount;
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
