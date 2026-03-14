import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, saveChatHistory } from "@/lib/storage/s3";
import type { MessageContentPart } from "@/lib/llm/types";

const UPDATABLE_PART_TYPES = new Set<MessageContentPart["type"]>([
  "agent_video",
]);

/**
 * Locate a part inside a message array using stable identifiers rather than
 * raw indices.  Returns { msgIdx, partIdx } or null if not found.
 *
 * - messageTimestamp: the createdAt value used as fallback identifier
 * - messageVariantId: preferred identifier for assistant messages
 * - partType:        the content part's `type` discriminator
 * - partTypeIndex:   0-based occurrence among parts of the same type
 *                    (accounts for hidden parts like internal_think)
 */
function findNthPartIndex(
  content: MessageContentPart[],
  partType: string,
  partTypeIndex: number
): number {
  let typeCount = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i].type === partType) {
      if (typeCount === partTypeIndex) {
        return i;
      }
      typeCount++;
    }
  }
  return -1;
}

function resolvePart(
  messages: ReturnType<typeof getChatHistory> extends Promise<infer T>
    ? T
    : never,
  messageTimestamp: number | undefined,
  messageVariantId: string | undefined,
  partType: string,
  partTypeIndex: number
): { msgIdx: number; partIdx: number } | null {
  // Preferred: variantId (stable for assistant variants)
  if (messageVariantId) {
    const msgIdx = messages.findIndex((m) => m.variantId === messageVariantId);
    if (msgIdx !== -1) {
      const content = messages[msgIdx].content;
      if (Array.isArray(content)) {
        const partIdx = findNthPartIndex(content, partType, partTypeIndex);
        if (partIdx !== -1) {
          return { msgIdx, partIdx };
        }
      }
    }
  }

  // Fallback: createdAt timestamp (can collide between user/assistant)
  if (typeof messageTimestamp === "number") {
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      const msg = messages[msgIdx];
      if (msg.createdAt !== messageTimestamp) continue;
      if (!Array.isArray(msg.content)) continue;

      const partIdx = findNthPartIndex(msg.content, partType, partTypeIndex);
      if (partIdx !== -1) {
        return { msgIdx, partIdx };
      }
    }
  }

  return null;
}

/**
 * PATCH /api/chat/[chatId]/parts
 *
 * Generic endpoint to update a message content part in place and persist to S3.
 * Designed to be extendable: add new part types to UPDATABLE_PART_TYPES.
 *
 * Parts are addressed with stable identifiers (not raw array indices):
 *   messageTimestamp – the message's createdAt value (fallback)
 *   messageVariantId – preferred for assistant messages
 *   partType         – the part's type discriminator (e.g. "agent_video")
 *   partTypeIndex    – 0-based occurrence among same-type parts in that message
 *
 * Body: {
 *   messageTimestamp?: number,
 *   messageVariantId?: string,
 *   partType: string,
 *   partTypeIndex: number,
 *   updates: object
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params;
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const {
      messageTimestamp,
      messageVariantId,
      partType,
      partTypeIndex,
      updates,
    } = body;

    if (
      typeof messageTimestamp !== "number" &&
      (typeof messageVariantId !== "string" || !messageVariantId)
    ) {
      return NextResponse.json(
        { error: "Either messageVariantId or messageTimestamp is required" },
        { status: 400 }
      );
    }
    if (
      messageVariantId !== undefined &&
      (typeof messageVariantId !== "string" || !messageVariantId)
    ) {
      return NextResponse.json(
        { error: "messageVariantId must be a non-empty string when provided" },
        { status: 400 }
      );
    }
    if (typeof partType !== "string" || !partType) {
      return NextResponse.json(
        { error: "partType must be a non-empty string" },
        { status: 400 }
      );
    }
    if (typeof partTypeIndex !== "number" || partTypeIndex < 0) {
      return NextResponse.json(
        { error: "partTypeIndex must be a non-negative number" },
        { status: 400 }
      );
    }
    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        { error: "updates must be a non-null object" },
        { status: 400 }
      );
    }

    if (!UPDATABLE_PART_TYPES.has(partType as MessageContentPart["type"])) {
      return NextResponse.json(
        { error: `Part type "${partType}" is not updatable` },
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

    const messages = await getChatHistory(chatId);

    const resolved = resolvePart(
      messages,
      typeof messageTimestamp === "number" ? messageTimestamp : undefined,
      typeof messageVariantId === "string" ? messageVariantId : undefined,
      partType,
      partTypeIndex
    );
    if (!resolved) {
      return NextResponse.json(
        { error: "Part not found" },
        { status: 404 }
      );
    }

    const { msgIdx, partIdx } = resolved;
    const message = messages[msgIdx];
    const content = message.content as MessageContentPart[];
    const part = content[partIdx];

    // The "type" field must never be changed
    const { type: _discard, ...safeUpdates } = updates;

    // Shallow-merge at top level; deep-merge one level for known object fields
    const merged = { ...part } as Record<string, any>;
    for (const [key, value] of Object.entries(safeUpdates)) {
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof merged[key] === "object" &&
        merged[key] !== null &&
        !Array.isArray(merged[key])
      ) {
        merged[key] = { ...merged[key], ...value };
      } else {
        merged[key] = value;
      }
    }

    // Write back
    const newContent = [...content];
    newContent[partIdx] = merged as MessageContentPart;

    const newMessages = [...messages];
    newMessages[msgIdx] = { ...message, content: newContent };

    await saveChatHistory(chatId, newMessages);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating chat part:", error);
    return NextResponse.json(
      { error: "Failed to update part" },
      { status: 500 }
    );
  }
}
