import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, saveChatHistory } from "@/lib/storage/s3";
import { Message, MessageContentPart } from "@/lib/llm/types";
import { agent1 } from "@/lib/agents/agent-1";
import { waitUntil } from "@vercel/functions";

/**
 * Extract text content from a message for differentiation context
 */
function extractTextContent(message: Message): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  const textParts: string[] = [];
  for (const part of message.content) {
    if (part.type === "text") {
      textParts.push(part.text);
    } else if (part.type === "agent_image") {
      // Include image suggestions as context
      textParts.push(
        `[Image suggestion: "${part.title}" - ${part.prompt}]`
      );
    }
  }
  return textParts.join("\n");
}

/**
 * Build differentiation context from existing variants
 */
function buildDifferentiationContext(existingVariants: Message[]): string {
  if (existingVariants.length === 0) {
    return "";
  }

  const variantDescriptions = existingVariants.map((variant, idx) => {
    const content = extractTextContent(variant);
    return `--- Previous Response ${idx + 1} ---\n${content}`;
  });

  return `
=== IMPORTANT: DIFFERENTIATION CONTEXT ===
The user has requested an alternative response. The following responses have already been provided:

${variantDescriptions.join("\n\n")}

Please generate a DIFFERENT response that:
- Offers a fresh perspective or creative direction
- Suggests different image concepts, styles, or compositions
- Avoids repeating the same ideas from previous responses
- Explores alternative interpretations of the user's request
===========================================

`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const requestStartTime = Date.now();
  console.log("[Variant] Request received", "[0ms]");

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

    // Parse request body
    const json = await request.json();
    const messageTimestamp: number = json.messageTimestamp;

    if (!messageTimestamp) {
      return NextResponse.json(
        { error: "messageTimestamp is required" },
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
    console.log(
      "[Variant] Chat history retrieved",
      `[${Date.now() - requestStartTime}ms]`
    );

    // Find the user message and existing variants by timestamp
    // The user message should be right before the assistant variants
    let userMessageIndex = -1;
    let userMessage: Message | null = null;
    const existingVariants: Message[] = [];

    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      // Find assistant messages with matching timestamp (these are the variants)
      if (msg.role === "assistant" && msg.createdAt === messageTimestamp) {
        existingVariants.push(msg);
        // The user message should be right before the first variant
        if (userMessageIndex === -1 && i > 0) {
          const prevMsg = history[i - 1];
          if (prevMsg.role === "user") {
            userMessageIndex = i - 1;
            userMessage = prevMsg;
          }
        }
      }
    }

    if (!userMessage) {
      return NextResponse.json(
        { error: "Could not find the original user message" },
        { status: 400 }
      );
    }

    console.log(
      `[Variant] Found ${existingVariants.length} existing variants for timestamp ${messageTimestamp}`
    );

    // Build the history up to (but not including) the user message
    const historyBeforeMessage = history.slice(0, userMessageIndex);

    // Build differentiation context from existing variants
    const differentiationContext = buildDifferentiationContext(existingVariants);

    // Modify the user message to include differentiation context
    let modifiedUserMessage: Message;
    if (typeof userMessage.content === "string") {
      modifiedUserMessage = {
        ...userMessage,
        content: differentiationContext + userMessage.content,
      };
    } else {
      // Prepend differentiation context as a text part
      const modifiedContent: MessageContentPart[] = [
        { type: "text", text: differentiationContext },
        ...userMessage.content,
      ];
      modifiedUserMessage = {
        ...userMessage,
        content: modifiedContent,
      };
    }

    // Extract image IDs from the original user message
    const imageIds: string[] = [];
    if (Array.isArray(userMessage.content)) {
      for (const part of userMessage.content) {
        if (part.type === "image" && part.imageId) {
          imageIds.push(part.imageId);
        }
      }
    }

    console.log(
      "[Variant] Calling agent for new variant",
      `[${Date.now() - requestStartTime}ms]`
    );

    // Generate a single new variant
    const { stream: agentStream, completions } =
      await agent1.processRequestParallel(
        historyBeforeMessage,
        modifiedUserMessage,
        payload.userId,
        isAdmin ?? false,
        1, // Generate only 1 variant
        requestStartTime,
        false, // precisionEditing
        imageIds
      );

    // Handle background completion (saving the new variant to history)
    waitUntil(
      completions
        .then(async (finalMessages) => {
          if (finalMessages.length === 0) {
            console.error("[Variant] No messages returned from agent");
            return;
          }

          const newVariant = finalMessages[0];
          // Use the same timestamp as existing variants so they're grouped together
          newVariant.createdAt = messageTimestamp;

          // Find where to insert the new variant (after existing variants with same timestamp)
          let insertIndex = history.length;
          for (let i = history.length - 1; i >= 0; i--) {
            if (
              history[i].role === "assistant" &&
              history[i].createdAt === messageTimestamp
            ) {
              insertIndex = i + 1;
              // Continue to find the last one
            } else if (insertIndex !== history.length) {
              // We've passed all the variants, stop
              break;
            }
          }

          // Insert the new variant
          const updatedHistory = [
            ...history.slice(0, insertIndex),
            newVariant,
            ...history.slice(insertIndex),
          ];

          await saveChatHistory(chatId, updatedHistory);
          console.log(
            `[Variant] New variant saved to history at index ${insertIndex}`
          );

          // Update chat timestamp
          await db
            .update(chats)
            .set({ updatedAt: new Date() })
            .where(eq(chats.id, chatId));
        })
        .catch((err) => {
          console.error("[Variant] Failed to save variant:", err);
        })
    );

    return new NextResponse(agentStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("[Variant] Error generating variant:", error);
    return NextResponse.json(
      { error: "Failed to generate variant" },
      { status: 500 }
    );
  }
}
