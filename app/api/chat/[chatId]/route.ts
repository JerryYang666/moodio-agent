import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats, videoGenerations, teamMembers } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getChatHistory, getImageUrl, getVideoUrl, getSignedVideoUrl, saveChatHistory } from "@/lib/storage/s3";
import { waitUntil } from "@vercel/functions";
import { Message, MessageContentPart } from "@/lib/llm/types";
import { getUserSetting } from "@/lib/user-settings/server";

export async function GET(
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

    // Verify ownership or admin status
    const isAdmin = payload.roles?.includes("admin");
    let chat;

    [chat] = await db.select().from(chats).where(eq(chats.id, chatId));

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const isOwner = chat.userId === payload.userId;

    if (!isOwner && !isAdmin) {
      // Hint-based team access: allow team owner/admin to view a member's chat
      const { searchParams } = new URL(request.url);
      const teamIdHint = searchParams.get("teamId");

      let granted = false;
      if (teamIdHint) {
        const membership = payload.teams?.find((t) => t.id === teamIdHint);
        if (membership && (membership.role === "owner" || membership.role === "admin")) {
          const [chatOwnerMembership] = await db
            .select()
            .from(teamMembers)
            .where(
              and(
                eq(teamMembers.teamId, teamIdHint),
                eq(teamMembers.userId, chat.userId)
              )
            )
            .limit(1);
          if (chatOwnerMembership) {
            granted = true;
          }
        }
      }

      if (!granted) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
    }

    const cnMode = await getUserSetting(payload.userId, "cnMode");
    const { messages, persistentAssets } = await getChatHistory(chatId, cnMode);

    // Collect direct_video generation IDs so we can reconcile with DB state
    const directVideoGenerationIds: string[] = [];
    for (const msg of messages) {
      if (typeof msg.content === "string") continue;
      for (const part of msg.content) {
        if (part.type === "direct_video" && part.generationId) {
          directVideoGenerationIds.push(part.generationId);
        }
      }
    }

    // Batch-query the DB for any direct_video generation records
    let generationMap: Map<string, typeof videoGenerations.$inferSelect> | undefined;
    if (directVideoGenerationIds.length > 0) {
      const generations = await db
        .select()
        .from(videoGenerations)
        .where(inArray(videoGenerations.id, directVideoGenerationIds));
      generationMap = new Map(generations.map((g) => [g.id, g]));
    }

    let s3Dirty = false;

    // Filter out internal_* for non-admins and add CloudFront URLs for images
    const processedMessages = messages.map((msg) => {
      if (typeof msg.content === "string") return msg;

      const processedContent = msg.content
        .filter((part) => isAdmin || !part.type.startsWith("internal_"))
        .map((part) => {
          // Add CloudFront URL for agent_image/direct_image parts
          if ((part.type === "agent_image" || part.type === "direct_image" || part.type === "agent_video_suggest") && part.imageId && !part.imageUrl) {
            return {
              ...part,
              imageUrl: getImageUrl(part.imageId, cnMode),
            };
          }
          // Add CloudFront URL for image parts (user uploaded images)
          if (part.type === "image" && part.imageId) {
            return {
              ...part,
              imageUrl: getImageUrl(part.imageId, cnMode),
            };
          }
          // Reconcile direct_video parts with actual DB state
          if (
            part.type === "direct_video" &&
            part.generationId &&
            generationMap?.has(part.generationId)
          ) {
            const gen = generationMap.get(part.generationId)!;
            if (gen.status === "completed" || gen.status === "failed") {
              const generationParams =
                typeof gen.params === "object" && gen.params !== null
                  ? (gen.params as Record<string, any>)
                  : {};
              const mergedModelParams = {
                ...part.config.params,
                ...Object.fromEntries(
                  Object.entries(generationParams).filter(
                    ([key]) =>
                      key !== "prompt" &&
                      key !== "image_url" &&
                      key !== "end_image_url"
                  )
                ),
              };
              const dbPrompt =
                typeof generationParams.prompt === "string"
                  ? generationParams.prompt
                  : part.config.prompt;
              s3Dirty = true;
              return {
                ...part,
                config: {
                  ...part.config,
                  sourceImageId: gen.sourceImageId,
                  sourceImageUrl: getImageUrl(gen.sourceImageId, cnMode),
                  endImageId: gen.endImageId ?? undefined,
                  endImageUrl: gen.endImageId
                    ? getImageUrl(gen.endImageId, cnMode)
                    : undefined,
                  prompt: dbPrompt,
                  params: mergedModelParams,
                },
                status: gen.status as "completed" | "failed",
                videoId: gen.videoId ?? undefined,
                videoUrl: gen.videoId ? getVideoUrl(gen.videoId, cnMode) : undefined,
                signedVideoUrl: gen.videoId ? getSignedVideoUrl(gen.videoId, undefined, cnMode) : undefined,
                thumbnailImageId: gen.thumbnailImageId ?? undefined,
                thumbnailUrl: gen.thumbnailImageId
                  ? getImageUrl(gen.thumbnailImageId, cnMode)
                  : undefined,
                seed: gen.seed ?? undefined,
                error: gen.error ?? undefined,
                completedAt: gen.completedAt?.toISOString() ?? undefined,
                provider: gen.provider ?? undefined,
                providerRequestId: gen.providerRequestId ?? undefined,
              };
            }
          }
          // Ensure direct_video URL fields are always derived from IDs at read time
          if (part.type === "direct_video") {
            return {
              ...part,
              config: {
                ...part.config,
                sourceImageUrl: getImageUrl(part.config.sourceImageId, cnMode),
                endImageUrl: part.config.endImageId
                  ? getImageUrl(part.config.endImageId, cnMode)
                  : undefined,
              },
              videoUrl: part.videoId ? getVideoUrl(part.videoId, cnMode) : part.videoUrl,
              signedVideoUrl: part.videoId
                ? getSignedVideoUrl(part.videoId, undefined, cnMode)
                : part.signedVideoUrl,
              thumbnailUrl: part.thumbnailImageId
                ? getImageUrl(part.thumbnailImageId, cnMode)
                : part.thumbnailUrl,
            };
          }
          return part;
        });

      return {
        ...msg,
        content: processedContent,
      };
    });

    // If any direct_video parts were reconciled, persist the update to S3 in the background
    if (s3Dirty) {
      // Build the updated messages for S3 (without display-only URLs, saveChatHistory strips them)
      const updatedForS3: Message[] = messages.map((msg) => {
        if (typeof msg.content === "string") return msg;
        const updatedContent = msg.content.map((part) => {
          if (
            part.type === "direct_video" &&
            part.generationId &&
            generationMap?.has(part.generationId)
          ) {
            const gen = generationMap.get(part.generationId)!;
            if (gen.status === "completed" || gen.status === "failed") {
              const generationParams =
                typeof gen.params === "object" && gen.params !== null
                  ? (gen.params as Record<string, any>)
                  : {};
              const mergedModelParams = {
                ...part.config.params,
                ...Object.fromEntries(
                  Object.entries(generationParams).filter(
                    ([key]) =>
                      key !== "prompt" &&
                      key !== "image_url" &&
                      key !== "end_image_url"
                  )
                ),
              };
              const dbPrompt =
                typeof generationParams.prompt === "string"
                  ? generationParams.prompt
                  : part.config.prompt;
              return {
                ...part,
                config: {
                  ...part.config,
                  sourceImageId: gen.sourceImageId,
                  sourceImageUrl: getImageUrl(gen.sourceImageId, cnMode),
                  endImageId: gen.endImageId ?? undefined,
                  endImageUrl: gen.endImageId
                    ? getImageUrl(gen.endImageId, cnMode)
                    : undefined,
                  prompt: dbPrompt,
                  params: mergedModelParams,
                },
                status: gen.status as "completed" | "failed",
                videoId: gen.videoId ?? undefined,
                videoUrl: gen.videoId ? getVideoUrl(gen.videoId, cnMode) : undefined,
                thumbnailImageId: gen.thumbnailImageId ?? undefined,
                thumbnailUrl: gen.thumbnailImageId
                  ? getImageUrl(gen.thumbnailImageId, cnMode)
                  : undefined,
                seed: gen.seed ?? undefined,
                error: gen.error ?? undefined,
                completedAt: gen.completedAt?.toISOString() ?? undefined,
                provider: gen.provider ?? undefined,
                providerRequestId: gen.providerRequestId ?? undefined,
              };
            }
          }
          return part;
        }) as MessageContentPart[];
        return { ...msg, content: updatedContent };
      });

      waitUntil(
        saveChatHistory(chatId, updatedForS3, persistentAssets).catch((err) => {
          console.error("[Chat GET] Background S3 update failed:", err);
        })
      );
    }

    // Add derived URLs for persistent reference images
    const processedPersistentAssets = {
      ...persistentAssets,
      referenceImages: persistentAssets.referenceImages.map((img) => ({
        ...img,
        imageUrl: getImageUrl(img.imageId, cnMode),
      })),
    };

    return NextResponse.json({
      chat,
      messages: processedMessages,
      persistentAssets: processedPersistentAssets,
      isOwner,
    });
  } catch (error) {
    console.error("Error fetching chat:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const body = await request.json();
    const { name, deleted } = body;

    // Verify ownership
    const [chat] = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, payload.userId)));

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Handle soft delete
    if (deleted === true) {
      await db
        .update(chats)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(chats.id, chatId));
      return NextResponse.json({ success: true, deleted: true });
    }

    // Handle rename
    if (name !== undefined) {
      if (!name || typeof name !== "string") {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      await db
        .update(chats)
        .set({ name, updatedAt: new Date() })
        .where(eq(chats.id, chatId));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "No valid update provided" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating chat:", error);
    return NextResponse.json(
      { error: "Failed to update chat" },
      { status: 500 }
    );
  }
}
