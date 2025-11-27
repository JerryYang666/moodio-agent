import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, saveChatHistory, uploadImage } from "@/lib/storage/s3";
import { createLLMClient } from "@/lib/llm/client";
import { Message, MessageContentPart } from "@/lib/llm/types";
import { agent1 } from "@/lib/agents/agent-1";
import { waitUntil } from "@vercel/functions";

const AWS_S3_PUBLIC_URL = process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL || "";

function convertToLLMFormat(message: Message): Message {
  if (typeof message.content === "string") {
    return message;
  }

  const newContent: MessageContentPart[] = message.content.map((part) => {
    if (part.type === "image") {
      return {
        type: "image_url",
        image_url: {
          url: `${AWS_S3_PUBLIC_URL}/${part.imageId}`,
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

    // Handle FormData or JSON
    let content = "";
    let file: File | null = null;
    let selection: { messageIndex: number; partIndex: number } | null = null;
    let precisionEditing = false;
    let precisionEditImageId: string | undefined;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      content = (formData.get("message") as string) || "";
      file = formData.get("file") as File | null;
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
    } else {
      const json = await request.json();
      content = json.content;
      selection = json.selection;
      if (json.precisionEditing) {
        precisionEditing = true;
      }
      if (json.precisionEditImageId) {
        precisionEditImageId = json.precisionEditImageId;
      }
    }

    if (!content && !file) {
      return NextResponse.json(
        { error: "Content or file is required" },
        { status: 400 }
      );
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
      const { messageIndex, partIndex } = selection;
      if (
        history[messageIndex] &&
        Array.isArray(history[messageIndex].content) &&
        history[messageIndex].content[partIndex]
      ) {
        const part = history[messageIndex].content[partIndex];
        if (part.type === "agent_image") {
          // Create a deep copy of history to modify
          history = history.map((msg, mIdx) => {
            if (mIdx !== messageIndex) return msg;

            const newContent = [...(msg.content as MessageContentPart[])];
            newContent[partIndex] = {
              ...newContent[partIndex],
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

    // Handle image upload
    let imageId: string | undefined;
    if (file) {
      // Check if it's the first message
      if (history.length > 0) {
        return NextResponse.json(
          { error: "Image upload is only allowed in the first message" },
          { status: 400 }
        );
      }

      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Image size limit is 5MB" },
          { status: 400 }
        );
      }
      imageId = await uploadImage(file, file.type);
    }

    console.log(
      "[Perf] Image upload end",
      `[${Date.now() - requestStartTime}ms]`
    );

    // Construct new user message
    let userMessage: Message;
    if (imageId) {
      userMessage = {
        role: "user",
        content: [
          { type: "text", text: content },
          { type: "image", imageId: imageId },
        ],
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

    // Use Agent 1
    const { stream: agentStream, completion } = await agent1.processRequest(
      history,
      userMessage,
      payload.userId,
      requestStartTime,
      precisionEditing,
      precisionEditImageId
    );

    // Handle background completion (saving history)
    waitUntil(
      completion
        .then(async (finalMessage) => {
          // Add timestamp to the final message from agent if not present (agent might not add it)
          const messageToSave = {
            ...finalMessage,
            createdAt: finalMessage.createdAt || Date.now(),
          };

          const updatedHistory = [...history, userMessage, messageToSave];
          await saveChatHistory(chatId, updatedHistory);

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

          // 2. Check current selection
          if (!thumbnailImageId && selection) {
            const selectedMsg = history[selection.messageIndex];
            if (selectedMsg && Array.isArray(selectedMsg.content)) {
              const part = selectedMsg.content[selection.partIndex];
              if (part) {
                if (part.type === "image") {
                  thumbnailImageId = part.imageId;
                } else if (part.type === "agent_image" && part.imageId) {
                  thumbnailImageId = part.imageId;
                }
              }
            }
          }

          // 3. Fallback: Traverse backwards to find the latest image
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

          // Generate chat name if needed
          if (history.length === 0 && updatedHistory.length === 2) {
            const llmClient = createLLMClient({
              apiKey: process.env.LLM_API_KEY,
              provider: "openai",
              model: "gpt-4.1",
            });

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
                ...updatedHistory.map((msg) => {
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
