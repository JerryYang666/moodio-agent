import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, saveChatHistory, uploadImage } from "@/lib/storage/s3";
import { createLLMClient } from "@/lib/llm/client";
import { Message, MessageContentPart } from "@/lib/llm/types";

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

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      content = (formData.get("message") as string) || "";
      file = formData.get("file") as File | null;
    } else {
      const json = await request.json();
      content = json.content;
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

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Get existing history
    const history = await getChatHistory(chatId);

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

    // Construct new user message
    let userMessage: Message;
    if (imageId) {
      userMessage = {
        role: "user",
        content: [
          { type: "text", text: content },
          { type: "image", imageId: imageId },
        ],
      };
    } else {
      userMessage = { role: "user", content };
    }

    // Combine history + new message (Storage Format)
    const messagesForStorage = [...history, userMessage];

    // Convert to LLM Format
    const messagesForLLM = messagesForStorage.map(convertToLLMFormat);

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

          const updatedHistory = [...messagesForStorage, assistantMessage];
          await saveChatHistory(chatId, updatedHistory);

          // Generate chat name if this is the first conversation round (User + Assistant = 2 messages)
          let newChatName = chat.name;

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
                // We need to convert updatedHistory to LLM format for this call too
                ...updatedHistory.map(convertToLLMFormat),
              ];

              const nameResponse = await llmClient.chatComplete(namePrompt);
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
                  console.warn(
                    "Failed to parse chat name JSON, using raw response fallback",
                    e
                  );
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
