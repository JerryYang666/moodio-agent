import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats, collectionImages, collectionShares, collections, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getChatHistory,
  saveChatHistory,
  uploadImage,
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

function convertToLLMFormat(message: Message): Message {
  if (typeof message.content === "string") {
    return message;
  }

  const newContent: MessageContentPart[] = message.content.map((part) => {
    if (part.type === "image") {
      return {
        type: "image_url",
        image_url: {
          url: getSignedImageUrl(part.imageId),
        },
      };
    }
    return part;
  });

  return {
    ...message,
    content: newContent,
  };
}

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

    // Handle FormData or JSON
    let content = "";
    let file: File | null = null;
    let assetId: string | undefined;
    let selection: {
      messageIndex: number;
      partIndex: number;
      imageId?: string;
      variantId?: string;
    } | null = null;
    let precisionEditing = false;
    let precisionEditImageId: string | undefined;
    let systemPromptOverride: string | undefined;
    let aspectRatioOverride: string | undefined;
    // New: array of selected image IDs
    let selectedImageIds: string[] = [];
    // New: pending file uploads (files that need to be uploaded and get IDs)
    let pendingFiles: File[] = [];

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      content = (formData.get("message") as string) || "";
      file = formData.get("file") as File | null;
      const assetIdStr = formData.get("assetId") as string;
      if (assetIdStr) assetId = assetIdStr;
      const selectionStr = formData.get("selection") as string;
      if (selectionStr) {
        try {
          selection = JSON.parse(selectionStr);
        } catch (e) {
          console.error("Failed to parse selection from FormData", e);
        }
      }
      if (formData.get("precisionEditing") === "true") {
        precisionEditing = true;
      }
      const pId = formData.get("precisionEditImageId") as string;
      if (pId) precisionEditImageId = pId;
      const spo = formData.get("systemPromptOverride") as string;
      if (spo) systemPromptOverride = spo;
      const ar = formData.get("aspectRatio") as string;
      if (ar) aspectRatioOverride = ar;

      // Parse selectedImageIds
      const selectedImageIdsStr = formData.get("selectedImageIds") as string;
      if (selectedImageIdsStr) {
        try {
          selectedImageIds = JSON.parse(selectedImageIdsStr);
        } catch (e) {
          console.error("Failed to parse selectedImageIds", e);
        }
      }

      // Parse pending files
      const pendingFileCountStr = formData.get("pendingFileCount") as string;
      if (pendingFileCountStr) {
        const count = parseInt(pendingFileCountStr, 10);
        for (let i = 0; i < count; i++) {
          const pendingFile = formData.get(`pendingFile_${i}`) as File | null;
          if (pendingFile) {
            pendingFiles.push(pendingFile);
          }
        }
      }
    } else {
      const json = await request.json();
      content = json.content;
      assetId = json.assetId;
      selection = json.selection;
      if (json.precisionEditing) {
        precisionEditing = true;
      }
      if (json.precisionEditImageId) {
        precisionEditImageId = json.precisionEditImageId;
      }
      if (json.systemPromptOverride) {
        systemPromptOverride = json.systemPromptOverride;
      }
      if (json.aspectRatio) {
        aspectRatioOverride = json.aspectRatio;
      }
      // Parse selectedImageIds from JSON
      if (json.selectedImageIds && Array.isArray(json.selectedImageIds)) {
        selectedImageIds = json.selectedImageIds;
      }
    }

    // Validation relaxed - we now allow selectedImageIds without file/assetId
    const hasSelectedImages = selectedImageIds.length > 0 || pendingFiles.length > 0;
    if (!content && !file && !assetId && !hasSelectedImages) {
      return NextResponse.json(
        { error: "Content, file, assetId, or selectedImageIds is required" },
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
        hasImage: !!file || !!assetId,
        imageSize: file ? file.size : undefined,
        imageType: file ? file.type : undefined,
        assetId: assetId || undefined,
        selection,
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
    let history = await getChatHistory(chatId);
    console.log(
      "[Perf] Chat history Got",
      `[${Date.now() - requestStartTime}ms]`
    );

    // Update history if selection is present
    if (selection) {
      const { messageIndex, imageId, variantId } = selection;

      // Find the actual message index in the flat history array
      // With variants, messageIndex from frontend is the group's originalIndex
      // We need to use variantId to find the correct message
      let actualMessageIndex = messageIndex;

      if (variantId) {
        // Find message by variantId (for parallel variants)
        const variantMsgIndex = history.findIndex(
          (msg) => msg.variantId === variantId
        );
        if (variantMsgIndex !== -1) {
          actualMessageIndex = variantMsgIndex;
        }
      }

      if (
        history[actualMessageIndex] &&
        Array.isArray(history[actualMessageIndex].content)
      ) {
        const content = history[actualMessageIndex]
          .content as MessageContentPart[];

        // Find the part by imageId (more reliable than partIndex)
        let targetPartIndex = -1;
        if (imageId) {
          targetPartIndex = content.findIndex(
            (p) => p.type === "agent_image" && p.imageId === imageId
          );
        }

        // Fallback to partIndex if imageId not found (backward compatibility)
        if (targetPartIndex === -1 && selection.partIndex !== undefined) {
          targetPartIndex = selection.partIndex;
        }

        if (
          targetPartIndex >= 0 &&
          content[targetPartIndex] &&
          content[targetPartIndex].type === "agent_image"
        ) {
          // Create a deep copy of history to modify
          history = history.map((msg, mIdx) => {
            if (mIdx !== actualMessageIndex) return msg;

            const newContent = [...(msg.content as MessageContentPart[])];
            newContent[targetPartIndex] = {
              ...newContent[targetPartIndex],
              // @ts-ignore - isSelected is optional
              isSelected: true,
            };

            return {
              ...msg,
              content: newContent,
            };
          });

          // We should save the updated history, but we can do it along with the new message
          // to minimize S3 writes.
        }
      }
    }

    console.log(
      "[Perf] Image upload start",
      `[${Date.now() - requestStartTime}ms]`
    );

    // Handle image upload - collect all image IDs for this message
    // This will hold: newly uploaded images, resolved assets, and already-selected images
    const allImageIds: string[] = [...selectedImageIds];

    // Handle legacy single file upload
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Image size limit is 5MB" },
          { status: 400 }
        );
      }
      const uploadedId = await uploadImage(file, file.type);
      allImageIds.push(uploadedId);
    }

    // Handle pending file uploads (new multi-image system)
    // Note: We'll upload these and the imageIds will be sent via SSE to update the frontend
    const pendingUploadResults: Array<{ imageId: string }> = [];
    for (const pendingFile of pendingFiles) {
      if (pendingFile.size > 5 * 1024 * 1024) {
        console.warn("Skipping pending file - too large:", pendingFile.name);
        continue;
      }
      const uploadedId = await uploadImage(pendingFile, pendingFile.type);
      pendingUploadResults.push({ imageId: uploadedId });
      allImageIds.push(uploadedId);
    }

    // Handle asset selection (legacy)
    if (assetId) {
      // Resolve asset to its underlying S3 imageId with access checks.
      const [asset] = await db
        .select({
          id: collectionImages.id,
          imageId: collectionImages.imageId,
          projectId: collectionImages.projectId,
          collectionId: collectionImages.collectionId,
        })
        .from(collectionImages)
        .where(eq(collectionImages.id, assetId))
        .limit(1);

      if (!asset) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      // Owner access via project ownership (projects are not shareable yet)
      const [ownedProject] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, asset.projectId), eq(projects.userId, payload.userId)))
        .limit(1);

      let canAccess = !!ownedProject;

      // Shared access via collection sharing
      if (!canAccess && asset.collectionId) {
        const [ownedCollection] = await db
          .select({ id: collections.id })
          .from(collections)
          .where(and(eq(collections.id, asset.collectionId), eq(collections.userId, payload.userId)))
          .limit(1);

        if (ownedCollection) {
          canAccess = true;
        } else {
          const [share] = await db
            .select({ id: collectionShares.id })
            .from(collectionShares)
            .where(
              and(
                eq(collectionShares.collectionId, asset.collectionId),
                eq(collectionShares.sharedWithUserId, payload.userId)
              )
            )
            .limit(1);
          if (share) canAccess = true;
        }
      }

      if (!canAccess) {
        return NextResponse.json(
          { error: "Asset not found or access denied" },
          { status: 404 }
        );
      }

      allImageIds.push(asset.imageId);
    }

    console.log(
      "[Perf] Image upload end",
      `[${Date.now() - requestStartTime}ms]`,
      `allImageIds: ${allImageIds.length}`
    );

    // Construct new user message with all images
    let userMessage: Message;
    if (allImageIds.length > 0) {
      const parts: MessageContentPart[] = [];
      if (content) {
        parts.push({ type: "text", text: content });
      }
      // Add all images to the message
      for (const imgId of allImageIds) {
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

    // Combine history + new message (Storage Format)
    // Wait, we shouldn't save userMessage to history YET if we want the agent to process it?
    // Actually we save it now so we have the full context.
    // But wait, if agent fails, we might want to rollback?
    // Let's assume we save user message first.
    // However, standard chat usually saves user message immediately.
    // Let's proceed with creating the Agent stream.
    console.log("[Perf] Calling agent", `[${Date.now() - requestStartTime}ms]`);

    // Use Agent 1 with parallel variants
    // Pass allImageIds (unified selection) instead of precisionEditImageId
    const { stream: agentStream, completions } =
      await agent1.processRequestParallel(
        history,
        userMessage,
        payload.userId,
        isAdmin ?? false,
        PARALLEL_VARIANT_COUNT,
        requestStartTime,
        precisionEditing,
        allImageIds, // New: array of all selected image IDs
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

          // Calculate thumbnail image ID
          let thumbnailImageId: string | null = null;

          // 1. Check current user upload
          if (Array.isArray(userMessage.content)) {
            const userImage = userMessage.content.find(
              (c) => c.type === "image"
            );
            if (userImage && "imageId" in userImage) {
              thumbnailImageId = userImage.imageId;
            }
          }

          // 2. Check current selection (use variantId to find correct message)
          if (!thumbnailImageId && selection) {
            let selectedMsg;
            if (selection.variantId) {
              // Find message by variantId for parallel variants
              selectedMsg = history.find(
                (msg) => msg.variantId === selection.variantId
              );
            } else {
              // Fallback to messageIndex for backward compatibility
              selectedMsg = history[selection.messageIndex];
            }
            
            if (selectedMsg && Array.isArray(selectedMsg.content)) {
              // Find part by imageId for reliability
              let part;
              if (selection.imageId) {
                part = selectedMsg.content.find(
                  (p) => p.type === "agent_image" && p.imageId === selection.imageId
                );
              }
              // Fallback to partIndex
              if (!part && selection.partIndex !== undefined) {
                part = selectedMsg.content[selection.partIndex];
              }
              
              if (part) {
                if (part.type === "image") {
                  thumbnailImageId = part.imageId;
                } else if (part.type === "agent_image" && part.imageId) {
                  thumbnailImageId = part.imageId;
                }
              }
            }
          }

          // 3. Fallback: Check the primary message for generated images
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

          // 4. Fallback: Traverse backwards to find the latest image
          // Priority:
          // 1. User uploaded image (type: "image")
          // 2. Selected agent image (type: "agent_image", isSelected: true)
          // 3. Latest generated image (type: "agent_image", status: "generated")
          if (!thumbnailImageId) {
            let latestGeneratedImageId: string | null = null;

            for (let i = updatedHistory.length - 1; i >= 0; i--) {
              const msg = updatedHistory[i];
              if (Array.isArray(msg.content)) {
                for (let j = msg.content.length - 1; j >= 0; j--) {
                  const part = msg.content[j];

                  // User uploaded image - High priority (most recent)
                  if (part.type === "image") {
                    thumbnailImageId = part.imageId;
                    break;
                  }

                  // Selected agent image - High priority
                  if (
                    part.type === "agent_image" &&
                    part.isSelected &&
                    part.imageId
                  ) {
                    thumbnailImageId = part.imageId;
                    break;
                  }

                  // Generated agent image - Fallback candidate
                  if (
                    part.type === "agent_image" &&
                    part.imageId &&
                    part.status === "generated" &&
                    !latestGeneratedImageId
                  ) {
                    latestGeneratedImageId = part.imageId;
                  }
                }
              }
              if (thumbnailImageId) break;
            }

            // If no user upload or selected image found, use the latest generated one
            if (!thumbnailImageId && latestGeneratedImageId) {
              thumbnailImageId = latestGeneratedImageId;
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
