import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChatHistory, saveChatHistory } from "@/lib/storage/s3";
import { PersistentAssets } from "@/lib/chat/persistent-assets-types";
import {
  uploadImage,
  getSignedImageUrl,
  getSignedVideoUrl,
  getSignedAudioUrl,
  generateImageId,
  downloadImage,
} from "@/lib/storage/s3";
import { getUserSettingsMulti } from "@/lib/user-settings/server";
import { createLLMClient } from "@/lib/llm/client";
import { Message, MessageContentPart, MessageMetadata, DEFAULT_LLM_MODEL, isGeneratedImagePart } from "@/lib/llm/types";
import { agent2 } from "@/lib/agents/agent-2";
import { waitUntil } from "@vercel/functions";
import { recordEvent, sanitizeGeminiResponse, sanitizeOpenAIResponse } from "@/lib/telemetry";
import {
  generateImageWithModel,
  editImageWithModel,
} from "@/lib/image/service";
import { ImageSize } from "@/lib/image/types";
import { calculateCost, parseImageSizeToNumber, parseImageQualityToNumber } from "@/lib/pricing";
import { deductCredits, getUserBalance, assertSufficientCredits, InsufficientCreditsError, getActiveAccount } from "@/lib/credits";
import { classifyImageError } from "@/lib/image/error-classify";
import {
  getVideoModel,
  validateAndMergeParams,
  DEFAULT_VIDEO_MODEL_ID,
  TEXT_TO_VIDEO_PLACEHOLDER_IMAGE_ID,
} from "@/lib/video/models";
import { submitVideoGeneration } from "@/lib/video/video-client";
import { videoGenerations } from "@/lib/db/schema";
import { siteConfig } from "@/config/site";
import { isFeatureFlagEnabled } from "@/lib/feature-flags/server";
import { recordResearchEvent } from "@/lib/research-telemetry";
import { withKeepAlive, STREAM_KEEPALIVE_HEADERS } from "@/lib/streaming/keep-alive";

// Long-running image/video generations can hold the streamed response for
// many minutes. Pin to the platform ceiling so the function isn't killed
// short of the KIE provider's 780s polling cap.
export const maxDuration = 800;

const MAX_IMAGES_PER_MESSAGE = siteConfig.imageLimits.maxImagesPerMessage;
const MAX_SUGGESTIONS_HARD_CAP = siteConfig.imageLimits.maxSuggestionsHardCap;
const DIRECT_IMAGE_MAX_RETRY = 2;

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
            isGeneratedImagePart(part) && part.imageId === selection.imageId
        );
      });
    }

    if (targetIndex < 0 || targetIndex >= updated.length) continue;
    const target = updated[targetIndex];
    if (!Array.isArray(target.content)) continue;

    const content = [...target.content];
    let partIndex = content.findIndex(
      (part) =>
        isGeneratedImagePart(part) && part.imageId === selection.imageId
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
    if (part && isGeneratedImagePart(part) && !part.isSelected) {
      content[partIndex] = { ...part, isSelected: true };
      updated[targetIndex] = { ...target, content };
    }
  }

  return updated;
};

/**
 * Shared post-processing for both agent and direct image modes.
 * Saves chat history, calculates thumbnail, generates chat name on first interaction.
 */
async function postProcessMessages(opts: {
  chatId: string;
  chat: { name: string | null };
  history: Message[];
  userMessage: Message;
  assistantMessages: Message[];
  imageSources: ImageSourceEntry[];
  userId: string;
  persistentAssets?: PersistentAssets;
}) {
  const { chatId, chat, history, userMessage, assistantMessages, imageSources, userId, persistentAssets } = opts;

  const historyWithSelections = applyImageSelections(history, imageSources);
  const updatedHistory = [...historyWithSelections, userMessage, ...assistantMessages];
  await saveChatHistory(chatId, updatedHistory, persistentAssets);

  // Use the first variant for thumbnail calculation
  const primaryMessage = assistantMessages[0];

  // Calculate thumbnail image ID
  // Priority: 1. User image  2. Generated image in response  3. Latest image in history
  let thumbnailImageId: string | null = null;

  // 1. Check current user images
  if (Array.isArray(userMessage.content)) {
    const userImage = userMessage.content.find((c) => c.type === "image");
    if (userImage && "imageId" in userImage) {
      thumbnailImageId = userImage.imageId;
    }
  }

  // 2. Check the primary message for generated images
  if (!thumbnailImageId && primaryMessage && Array.isArray(primaryMessage.content)) {
    for (const part of primaryMessage.content) {
      if (isGeneratedImagePart(part) && part.imageId && part.status === "generated") {
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
          if (isGeneratedImagePart(part) && part.imageId && part.status === "generated") {
            thumbnailImageId = part.imageId;
            break;
          }
        }
      }
      if (thumbnailImageId) break;
    }
  }

  // Generate chat name if first interaction
  const isFirstInteraction = history.length === 0;
  if (isFirstInteraction) {
    const llmClient = createLLMClient({
      apiKey: process.env.LLM_API_KEY,
      provider: "openai",
      model: DEFAULT_LLM_MODEL,
    });

    try {
      const messagesForNaming = [userMessage, ...(primaryMessage ? [primaryMessage] : [])];
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
          return { role: msg.role, content: textContent };
        }),
      ];

      const nameResponse = await llmClient.chatComplete(namePrompt);
      let newChatName = chat.name || "New Chat";

      if (nameResponse) {
        try {
          const cleanResponse = nameResponse.replace(/```json\n?|```/g, "").trim();
          const parsed = JSON.parse(cleanResponse);
          if (parsed && parsed.chat_name) {
            newChatName = parsed.chat_name.trim().slice(0, 255);
          }
        } catch (e) {
          if (nameResponse.length < 255 && !nameResponse.includes("{")) {
            newChatName = nameResponse.trim();
          }
        }
      }

      await db
        .update(chats)
        .set({ updatedAt: new Date(), name: newChatName, thumbnailImageId })
        .where(eq(chats.id, chatId));
    } catch (err) {
      console.error("Failed to generate chat name:", err);
    }
  } else {
    await db
      .update(chats)
      .set({ updatedAt: new Date(), thumbnailImageId })
      .where(eq(chats.id, chatId));
  }
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

    const account = await getActiveAccount(payload.userId, payload);
    const { cnMode, languagePreference } = await getUserSettingsMulti(payload.userId, ["cnMode", "languagePreference"]);

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
    const imageQualityOverride: "auto" | "low" | "medium" | "high" | undefined =
      json.imageQuality === "auto" ||
      json.imageQuality === "low" ||
      json.imageQuality === "medium" ||
      json.imageQuality === "high"
        ? json.imageQuality
        : undefined;
    // Accept optional variantCount parameter, default to 1 (lazy variant generation)
    const variantCount: number =
      typeof json.variantCount === "number" && json.variantCount >= 1
        ? Math.min(json.variantCount, 4) // Cap at 4 variants max
        : 1;
    // Accept optional imageQuantity parameter (1-MAX, undefined = smart/agent decides)
    const imageQuantity: number | undefined =
      typeof json.imageQuantity === "number" &&
      json.imageQuantity >= 1 &&
      json.imageQuantity <= MAX_SUGGESTIONS_HARD_CAP
        ? json.imageQuantity
        : undefined;
    // Reference images are now loaded from persistent assets in S3 (see below)

    // Parse video sources
    type VideoSourceEntry = {
      videoId: string;
      source: "retrieval" | "upload" | "library" | "ai_generated";
      videoUrl: string;
    };
    const rawVideoSources = Array.isArray(json.videoSources) ? json.videoSources : [];
    const videoSources: VideoSourceEntry[] = rawVideoSources
      .filter((entry: any) => typeof entry?.videoId === "string")
      .map((entry: any) => ({
        videoId: entry.videoId as string,
        source: (["retrieval", "upload", "library", "ai_generated"].includes(entry.source)
          ? entry.source
          : "upload") as VideoSourceEntry["source"],
        videoUrl: typeof entry.videoUrl === "string" ? entry.videoUrl : "",
      }));

    // Parse audio sources
    type AudioSourceEntry = {
      audioId: string;
      source: "upload" | "library";
      title?: string;
    };
    const rawAudioSources = Array.isArray(json.audioSources) ? json.audioSources : [];
    const audioSources: AudioSourceEntry[] = rawAudioSources
      .filter((entry: any) => typeof entry?.audioId === "string")
      .map((entry: any) => ({
        audioId: entry.audioId as string,
        source: (["upload", "library"].includes(entry.source)
          ? entry.source
          : "upload") as AudioSourceEntry["source"],
        title: typeof entry.title === "string" ? entry.title : undefined,
      }));

    // Parse expertise selection
    const VALID_EXPERTISE = ["film", "ugcAd", "game", "musicVideo", "shortDrama", "animation"] as const;
    type Expertise = typeof VALID_EXPERTISE[number];
    const expertise: Expertise | undefined =
      typeof json.expertise === "string" && (VALID_EXPERTISE as readonly string[]).includes(json.expertise)
        ? (json.expertise as Expertise)
        : undefined;

    // Parse mode (agent, image, or video)
    const mode: string =
      json.mode === "image" ? "image" :
      json.mode === "video" ? "video" : "agent";

    // Parse video-specific fields
    const videoModelId: string | undefined =
      typeof json.videoModelId === "string" ? json.videoModelId : undefined;
    const videoParams: Record<string, any> =
      json.videoParams && typeof json.videoParams === "object"
        ? json.videoParams
        : {};

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
        precisionEditing,
        systemPromptOverride,
        aspectRatioOverride,
        imageSizeOverride,
        imageModelId,
        imageQualityOverride,
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
    const { messages: history, persistentAssets } = await getChatHistory(chatId, cnMode);
    console.log(
      "[Perf] Chat history Got",
      `[${Date.now() - requestStartTime}ms]`
    );

    // Construct new user message with all image IDs
    // Images are already uploaded, we just reference them by ID
    let userMessage: Message;

    const metadata: MessageMetadata = {
      mode,
      imageModelId,
      imageSize: imageSizeOverride,
      imageQuality: imageQualityOverride,
      aspectRatio: aspectRatioOverride,
      imageQuantity,
      precisionEditing: precisionEditing || undefined,
      videoModelId: mode === "video" ? videoModelId : undefined,
      videoParams: mode === "video" ? videoParams : undefined,
    };

    if (imageIds.length > 0 || videoSources.length > 0 || audioSources.length > 0) {
      const sourceById = new Map<string, ImageSourceEntry>(
        imageSources.map((entry) => [entry.imageId, entry])
      );
      const parts: MessageContentPart[] = [];
      if (content) {
        parts.push({ type: "text", text: content });
      }
      for (const imgId of imageIds) {
        const sourceEntry = sourceById.get(imgId);
        parts.push({
          type: "image",
          imageId: imgId,
          source: sourceEntry?.source,
          title: sourceEntry?.title,
        });
      }
      for (const vid of videoSources) {
        parts.push({
          type: "video",
          videoId: vid.videoId,
          source: vid.source,
          videoUrl: vid.videoUrl,
        });
      }
      for (const aud of audioSources) {
        parts.push({
          type: "audio",
          audioId: aud.audioId,
          source: aud.source,
          title: aud.title,
        });
      }
      userMessage = {
        role: "user",
        content: parts,
        createdAt: Date.now(),
        metadata,
      };
    } else if (mode === "video" && Array.isArray(videoParams?.media_references) && videoParams.media_references.length > 0) {
      const parts: MessageContentPart[] = [];
      if (content) {
        parts.push({ type: "text", text: content });
      }
      parts.push({
        type: "media_references",
        references: videoParams.media_references.map((ref: any) => ({
          refType: ref.type,
          id: ref.id,
        })),
      });
      userMessage = {
        role: "user",
        content: parts,
        createdAt: Date.now(),
        metadata,
      };
    } else {
      userMessage = { role: "user", content, createdAt: Date.now(), metadata };
    }

    console.log(`[Perf] Mode=${mode}, calling handler`, `[${Date.now() - requestStartTime}ms]`);

    // Generate a timestamp for all variants - this will be synced with frontend
    const messageTimestamp = Date.now();

    if (mode === "image") {
      // ===== Direct Image Generation Mode =====
      // Bypass the agent and send the user's prompt directly to the image API
      const encoder = new TextEncoder();
      const variantId = `variant-0-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const numImages = imageQuantity || 1;

      // Generate a concise title from the prompt using LLM
      let baseTitle = content?.slice(0, 50) || "Image";
      try {
        const titleClient = createLLMClient({
          apiKey: process.env.LLM_API_KEY,
          provider: "openai",
          model: DEFAULT_LLM_MODEL,
        });
        const titlePrompt: Message[] = [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates concise, descriptive titles for AI-generated images. " +
              "Based on the user's image generation prompt, generate a short title that captures the essence of the image. " +
              "The title MUST be very concise and no longer than 50 characters. " +
              "Give the title in the same language as the prompt. " +
              'Output JSON only. Format: {"title": "Your Image Title"}',
          },
          { role: "user", content: content || "Image" },
        ];
        const titleResponse = await titleClient.chatComplete(titlePrompt);
        if (titleResponse) {
          try {
            const clean = titleResponse.replace(/```json\n?|```/g, "").trim();
            const parsed = JSON.parse(clean);
            if (parsed?.title) {
              baseTitle = parsed.title.trim().slice(0, 50);
            }
          } catch {
            if (titleResponse.length < 50 && !titleResponse.includes("{")) {
              baseTitle = titleResponse.trim();
            }
          }
        }
      } catch (err) {
        console.error("Failed to generate image title:", err);
      }

      const getImageTitle = (index: number) =>
        numImages > 1 ? `${baseTitle}-${index + 1}` : baseTitle;

      // Promise that resolves when generation is complete (for post-processing)
      let resolveCompletion: (parts: MessageContentPart[]) => void;
      const completionPromise = new Promise<MessageContentPart[]>((resolve) => {
        resolveCompletion = resolve;
      });

      // Research telemetry: reference_image_added (direct image mode)
      if (imageIds.length > 0) {
        void (async () => {
          try {
            if (await isFeatureFlagEnabled(payload.userId, "res_telemetry")) {
              void recordResearchEvent({
                userId: payload.userId,
                chatId,
                eventType: "reference_image_added",
                turnIndex: history.length,
                metadata: {
                  referenceImageIds: imageIds,
                  outputType: "image",
                  generationMethod: "img2img",
                },
              }).catch((e) => console.error("[ResearchTelemetry] reference_image_added failed:", e));
            }
          } catch (e) {
            console.error("[ResearchTelemetry] reference_image_added flag check failed:", e);
          }
        })();
      }

      const directStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (data: any) => {
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          };

          // Send timestamp first
          send({ type: "message_timestamp", timestamp: messageTimestamp });

          (async () => {
            const generatedParts: MessageContentPart[] = [];

            try {
              // Generate images in parallel
              const imagePromises = Array.from({ length: numImages }, async (_, i) => {
                const trackingImageId = generateImageId();

                // Send placeholder
                const placeholder: MessageContentPart = {
                  type: "direct_image",
                  imageId: trackingImageId,
                  title: getImageTitle(i),
                  aspectRatio: aspectRatioOverride || "1:1",
                  prompt: content,
                  status: "loading",
                };
                send({ type: "part", part: placeholder, variantId });

                try {
                  // Calculate cost and verify balance
                  const resolution = parseImageSizeToNumber(imageSizeOverride || "2k");
                  const quality = parseImageQualityToNumber(imageQualityOverride);
                  const cost = await calculateCost(imageModelId || "Image/all", {
                    resolution,
                    quality,
                  });
                  if (cost > 0) {
                    const balance = await getUserBalance(account.accountId, account.accountType);
                    if (balance < cost) {
                      throw new InsufficientCreditsError();
                    }
                  }

                  // Determine whether to edit or generate (with retry for transient errors)
                  let result;
                  let lastGenError: unknown;
                  for (let attempt = 0; attempt <= DIRECT_IMAGE_MAX_RETRY; attempt++) {
                    try {
                      if (attempt > 0) {
                        console.log(
                          `[Direct-Image] Retrying image generation, attempt ${attempt + 1}/${DIRECT_IMAGE_MAX_RETRY + 1}`
                        );
                      }

                      if (imageIds.length > 0) {
                        const imageBase64Data = await Promise.all(
                          imageIds.map(async (imgId) => {
                            try {
                              const buf = await downloadImage(imgId);
                              return buf ? buf.toString("base64") : undefined;
                            } catch {
                              return undefined;
                            }
                          })
                        );
                        const validImageBase64 = imageBase64Data.filter(
                          (data): data is string => data !== undefined
                        );

                        if (validImageBase64.length > 0) {
                          result = await editImageWithModel(imageModelId, {
                            prompt: content,
                            imageIds,
                            imageBase64: validImageBase64,
                            aspectRatio: aspectRatioOverride,
                            imageSize: imageSizeOverride,
                            quality: imageQualityOverride,
                          });
                        } else {
                          result = await generateImageWithModel(imageModelId, {
                            prompt: content,
                            aspectRatio: aspectRatioOverride,
                            imageSize: imageSizeOverride,
                            quality: imageQualityOverride,
                          });
                        }
                      } else {
                        result = await generateImageWithModel(imageModelId, {
                          prompt: content,
                          aspectRatio: aspectRatioOverride,
                          imageSize: imageSizeOverride,
                          quality: imageQualityOverride,
                        });
                      }

                      if (attempt > 0) {
                        console.log(
                          `[Direct-Image] Image generation succeeded on retry attempt ${attempt + 1}`
                        );
                      }
                      break;
                    } catch (genErr) {
                      if (genErr instanceof InsufficientCreditsError) {
                        throw genErr;
                      }
                      lastGenError = genErr;
                      console.error(
                        `[Direct-Image] Image generation attempt ${attempt + 1}/${DIRECT_IMAGE_MAX_RETRY + 1} failed:`,
                        genErr
                      );
                    }
                  }

                  if (!result) {
                    throw lastGenError || new Error("Image generation failed after retries");
                  }

                  // Upload the generated image
                  const finalImageId = await uploadImage(
                    result.imageBuffer,
                    result.contentType,
                    trackingImageId
                  );

                  // Deduct credits
                  if (cost > 0) {
                    await deductCredits(
                      account.accountId,
                      cost,
                      "image_generation",
                      `Direct image generation (${imageModelId || "default"}, ${imageSizeOverride || "2k"})`,
                      account.performedBy,
                      { type: "chat", id: chatId },
                      account.accountType,
                    );
                  }

                  // Record success
                  const response =
                    result.provider === "google"
                      ? sanitizeGeminiResponse(result.response)
                      : result.provider === "openai"
                        ? sanitizeOpenAIResponse(result.response)
                        : result.response;
                  await recordEvent("image_generation", payload.userId, {
                    status: "success",
                    mode: "direct",
                    provider: result.provider,
                    modelId: result.modelId,
                    providerModelId: result.providerModelId,
                    prompt: content,
                    aspectRatio: aspectRatioOverride,
                    imageSize: imageSizeOverride,
                    imageQuality: imageQualityOverride,
                    response,
                  });

                  const successPart: MessageContentPart = {
                    type: "direct_image",
                    imageId: finalImageId,
                    imageUrl: getSignedImageUrl(finalImageId, undefined, cnMode),
                    title: getImageTitle(i),
                    aspectRatio: aspectRatioOverride || "1:1",
                    prompt: content,
                    status: "generated",
                  };
                  send({ type: "part_update", imageId: trackingImageId, part: successPart, variantId });
                  return successPart;
                } catch (err) {
                  console.error(`Direct image gen error for imageId ${trackingImageId}`, err);
                  const isInsufficientCredits = err instanceof InsufficientCreditsError;
                  const rawErrMsg = err instanceof Error ? err.message : String(err);
                  const reason = isInsufficientCredits
                    ? "INSUFFICIENT_CREDITS"
                    : classifyImageError(rawErrMsg);
                  const errorPart: MessageContentPart = {
                    type: "direct_image",
                    imageId: trackingImageId,
                    title: getImageTitle(i),
                    aspectRatio: "1:1",
                    prompt: content,
                    status: "error",
                    reason,
                  };
                  send({ type: "part_update", imageId: trackingImageId, part: errorPart, variantId });
                  return errorPart;
                }
              });

              const results = await Promise.all(imagePromises);
              generatedParts.push(...results);
            } catch (err) {
              console.error("Direct image generation failed:", err);
              send({ type: "variant_failed", variantId, reason: "generation_failed" });
            }

            controller.close();
            resolveCompletion(generatedParts);
          })();
        },
      });

      // Use waitUntil for reliable post-processing (same as agent mode)
      waitUntil(
        completionPromise
          .then(async (generatedParts) => {
            const assistantMessage: Message = {
              role: "assistant",
              content: generatedParts,
              createdAt: messageTimestamp,
              agentId: "direct-image",
              variantId,
            };

            await postProcessMessages({
              chatId,
              chat,
              history,
              userMessage,
              assistantMessages: [assistantMessage],
              imageSources,
              userId: payload.userId,
              persistentAssets,
            });
          })
          .catch((err) => {
            console.error("Direct image post-processing failed:", err);
          })
      );

      return new NextResponse(withKeepAlive(directStream), {
        headers: STREAM_KEEPALIVE_HEADERS,
      });
    }

    if (mode === "video") {
      // ===== Direct Video Generation Mode =====
      const encoder = new TextEncoder();
      const variantId = `variant-0-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const modelId = videoModelId || DEFAULT_VIDEO_MODEL_ID;
      const model = getVideoModel(modelId);

      if (!model) {
        return NextResponse.json(
          { error: `Unknown video model: ${modelId}` },
          { status: 400 }
        );
      }

      const sourceImageId = imageIds[0];
      const isTextToVideo = !model.imageParams;
      const sourceImageParam = model.imageParams
        ? model.params.find((p) => p.name === model.imageParams!.sourceImage)
        : undefined;
      const sourceImageRequired =
        !isTextToVideo && sourceImageParam?.required !== false;

      if (sourceImageRequired && !sourceImageId) {
        return NextResponse.json(
          { error: "Source image is required for this model" },
          { status: 400 }
        );
      }

      const endImageId = imageIds[1] || null;

      // Build full params with signed image URLs
      const fullParams: Record<string, any> = {
        prompt: content,
        ...videoParams,
      };
      if (!isTextToVideo && sourceImageId) {
        fullParams[model.imageParams!.sourceImage] = getSignedImageUrl(sourceImageId);
        if (endImageId && model.imageParams!.endImage) {
          fullParams[model.imageParams!.endImage] = getSignedImageUrl(endImageId);
        }
      }

      // Sign image IDs for type: "asset" params
      for (const param of model.params) {
        if (param.type === "asset" && typeof fullParams[param.name] === "string" && fullParams[param.name]) {
          fullParams[param.name] = getSignedImageUrl(fullParams[param.name]);
        }
      }

      // Resolve image IDs inside kling_elements to signed URLs for the provider API
      if (Array.isArray(fullParams.kling_elements)) {
        fullParams.kling_elements = fullParams.kling_elements.map(
          (el: { name: string; description: string; element_input_ids?: string[]; element_input_urls?: string[] }) => ({
            name: el.name,
            description: el.description,
            element_input_urls: (el.element_input_ids || el.element_input_urls || []).map((idOrUrl: string) => {
              if (idOrUrl.startsWith("http") && !idOrUrl.includes("moodio.art/images/")) {
                return idOrUrl;
              }
              const cfMatch = idOrUrl.match(/\/images\/([^/?]+)/);
              if (cfMatch) {
                return getSignedImageUrl(cfMatch[1]);
              }
              return getSignedImageUrl(idOrUrl);
            }),
          })
        );
      }

      // Resolve media_references IDs to signed URLs for the provider API
      if (Array.isArray(fullParams.media_references)) {
        fullParams.media_references = fullParams.media_references.map(
          (ref: { type: "image" | "video" | "audio"; id: string }) => ({
            type: ref.type,
            id:
              typeof ref.id === "string" && ref.id.startsWith("http")
                ? ref.id
                : ref.type === "video"
                  ? getSignedVideoUrl(ref.id)
                  : ref.type === "audio"
                    ? getSignedAudioUrl(ref.id)
                    : getSignedImageUrl(ref.id),
          })
        );
      }

      const effectiveSourceImageId = (isTextToVideo || !sourceImageId)
        ? TEXT_TO_VIDEO_PLACEHOLDER_IMAGE_ID
        : sourceImageId;

      // Validate and merge with defaults
      let mergedParams: Record<string, any>;
      try {
        mergedParams = validateAndMergeParams(modelId, fullParams);
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message || "Invalid parameters" },
          { status: 400 }
        );
      }

      // Calculate cost
      const cost = await calculateCost(modelId, mergedParams);

      // Promise for post-processing
      let resolveCompletion: (part: MessageContentPart) => void;
      const completionPromise = new Promise<MessageContentPart>((resolve) => {
        resolveCompletion = resolve;
      });

      const videoStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (data: any) => {
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          };

          send({ type: "message_timestamp", timestamp: messageTimestamp });

          (async () => {
            let generatedPart: MessageContentPart;
            let generation: { id: string } | undefined;

            try {
              // Check balance before doing any work
              await assertSufficientCredits(account.accountId, cost, account.accountType);

              // Create generation record (no credit deduction yet)
              [generation] = await db
                .insert(videoGenerations)
                .values({
                  userId: payload.userId,
                  modelId,
                  status: "pending",
                  sourceImageId: effectiveSourceImageId,
                  endImageId,
                  params: mergedParams,
                })
                .returning();

              // Research telemetry: reference_image_added (direct video mode)
              if (effectiveSourceImageId && effectiveSourceImageId !== TEXT_TO_VIDEO_PLACEHOLDER_IMAGE_ID) {
                void (async () => {
                  try {
                    if (await isFeatureFlagEnabled(payload.userId, "res_telemetry")) {
                      const refIds = [effectiveSourceImageId];
                      if (endImageId) refIds.push(endImageId);
                      void recordResearchEvent({
                        userId: payload.userId,
                        chatId,
                        eventType: "reference_image_added",
                        imageId: effectiveSourceImageId,
                        turnIndex: history.length,
                        metadata: {
                          referenceImageIds: refIds,
                          outputType: "video",
                          outputId: generation.id,
                          generationMethod: "img2vid",
                        },
                      }).catch((e) => console.error("[ResearchTelemetry] reference_image_added failed:", e));
                    }
                  } catch (e) {
                    console.error("[ResearchTelemetry] reference_image_added flag check failed:", e);
                  }
                })();
              }

              // Send initial part with generationId
              const pendingPart: MessageContentPart = {
                type: "direct_video",
                config: {
                  modelId,
                  modelName: model.name,
                  prompt: content,
                  sourceImageId: effectiveSourceImageId,
                  sourceImageUrl: getSignedImageUrl(effectiveSourceImageId, undefined, cnMode),
                  endImageId: endImageId || undefined,
                  endImageUrl: endImageId ? getSignedImageUrl(endImageId, undefined, cnMode) : undefined,
                  params: videoParams,
                },
                generationId: generation.id,
                status: "processing",
                thumbnailUrl: getSignedImageUrl(effectiveSourceImageId, undefined, cnMode),
                createdAt: new Date().toISOString(),
              };
              send({ type: "part", part: pendingPart, variantId });

              // Submit to provider queue
              const { requestId, provider, providerModelId } = await submitVideoGeneration(
                modelId,
                mergedParams,
              );

              // Submission succeeded — deduct credits and update record atomically
              await db.transaction(async (tx) => {
                await deductCredits(
                  account.accountId,
                  cost,
                  "video_generation",
                  `Generated video with model ${model.name} (chat)`,
                  account.performedBy,
                  { type: "video_generation", id: generation!.id },
                  account.accountType,
                  tx
                );

                await tx
                  .update(videoGenerations)
                  .set({
                    providerRequestId: requestId,
                    provider,
                    providerModelId,
                    status: "processing",
                  })
                  .where(eq(videoGenerations.id, generation!.id));
              });

              await recordEvent(
                "video_generation",
                payload.userId,
                {
                  status: "submitted",
                  generationId: generation.id,
                  providerRequestId: requestId,
                  modelId,
                  sourceImageId: effectiveSourceImageId,
                  endImageId,
                  params: mergedParams,
                  cost,
                  source: "chat",
                },
                ipAddress
              );

              generatedPart = pendingPart;
            } catch (err: any) {
              console.error("Direct video generation error:", err);

              // Mark the DB record as failed so it doesn't stay "pending" forever
              if (generation?.id) {
                try {
                  await db
                    .update(videoGenerations)
                    .set({
                      status: "failed",
                      error: err.message || "Failed to submit to provider",
                      completedAt: new Date(),
                    })
                    .where(eq(videoGenerations.id, generation!.id));
                } catch (dbErr) {
                  console.error("Failed to mark generation as failed in DB:", dbErr);
                }
              }

              const isInsufficientCredits =
                err.message === "INSUFFICIENT_CREDITS" ||
                err instanceof InsufficientCreditsError;

              generatedPart = {
                type: "direct_video",
                config: {
                  modelId,
                  modelName: model.name,
                  prompt: content,
                  sourceImageId: effectiveSourceImageId,
                  sourceImageUrl: getSignedImageUrl(effectiveSourceImageId, undefined, cnMode),
                  endImageId: endImageId || undefined,
                  endImageUrl: endImageId ? getSignedImageUrl(endImageId, undefined, cnMode) : undefined,
                  params: videoParams,
                },
                generationId: generation?.id,
                status: "failed",
                error: isInsufficientCredits
                  ? "INSUFFICIENT_CREDITS"
                  : err.message || "Failed to start video generation",
                thumbnailUrl: getSignedImageUrl(effectiveSourceImageId, undefined, cnMode),
                createdAt: new Date().toISOString(),
              };
              send({ type: "part", part: generatedPart, variantId });
            }

            controller.close();
            resolveCompletion!(generatedPart);
          })();
        },
      });

      // Post-process: save chat history
      waitUntil(
        completionPromise
          .then(async (generatedPart) => {
            const assistantMessage: Message = {
              role: "assistant",
              content: [generatedPart],
              createdAt: messageTimestamp,
              agentId: "direct-video",
              variantId,
            };

            await postProcessMessages({
              chatId,
              chat,
              history,
              userMessage,
              assistantMessages: [assistantMessage],
              imageSources,
              userId: payload.userId,
              persistentAssets,
            });
          })
          .catch((err) => {
            console.error("Direct video post-processing failed:", err);
          })
      );

      return new NextResponse(withKeepAlive(videoStream), {
        headers: STREAM_KEEPALIVE_HEADERS,
      });
    }

    // ===== Agent Mode (default) =====
    // Use Agent 2 with parallel variants
    // Pass all imageIds directly - the agent will use these for image generation
    const { stream: agentStream, completions } =
      await agent2.processRequestParallel(
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
        persistentAssets.referenceImages, // Reference images from persistent assets
        imageQuantity, // Pass user-selected image quantity (undefined = smart)
        expertise, // Pass expertise selection for system prompt
        persistentAssets.textChunk, // Persistent text chunk for system prompt
        account.accountId,
        account.accountType,
        account.performedBy,
        cnMode,
        chatId,
        languagePreference || undefined,
        imageQualityOverride,
      );

    // Research telemetry: reference_image_added (agent mode)
    const allRefImageIds = [
      ...(persistentAssets.referenceImages?.map((r) => r.imageId) || []),
      ...imageIds,
    ];
    if (allRefImageIds.length > 0) {
      void (async () => {
        try {
          if (await isFeatureFlagEnabled(payload.userId, "res_telemetry")) {
            void recordResearchEvent({
              userId: payload.userId,
              chatId,
              eventType: "reference_image_added",
              turnIndex: history.length,
              metadata: {
                referenceImageIds: allRefImageIds,
                outputType: "image",
                generationMethod: "variation",
              },
            }).catch((e) => console.error("[ResearchTelemetry] reference_image_added failed:", e));
          }
        } catch (e) {
          console.error("[ResearchTelemetry] reference_image_added flag check failed:", e);
        }
      })();
    }

    // Handle background completion (saving history)
    waitUntil(
      completions
        .then(async (finalMessages) => {
          // Filter out failed variants (error-only messages that the client already discarded)
          const successfulMessages = finalMessages.filter((msg) => {
            if (!Array.isArray(msg.content)) {
              const text = typeof msg.content === "string" ? msg.content : "";
              if (text === "Failed to generate response") return false;
            }
            return true;
          });

          if (successfulMessages.length === 0) return;

          const messagesToSave: Message[] = successfulMessages.map((msg) => ({
            ...msg,
            createdAt: msg.createdAt || messageTimestamp,
          }));

          await postProcessMessages({
            chatId,
            chat,
            history,
            userMessage,
            assistantMessages: messagesToSave,
            imageSources,
            userId: payload.userId,
            persistentAssets,
          });
        })
        .catch((err) => {
          console.error("Agent completion failed:", err);
        })
    );

    return new NextResponse(withKeepAlive(agentStream), {
      headers: STREAM_KEEPALIVE_HEADERS,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
