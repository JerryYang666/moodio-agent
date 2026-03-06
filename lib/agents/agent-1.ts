import { Agent, AgentResponse, ParallelAgentResponse } from "./types";
import { Message, MessageContentPart, DEFAULT_LLM_MODEL } from "@/lib/llm/types";
import { ImageSize } from "@/lib/image/types";
import {
  downloadImage,
  uploadImage,
  getSignedImageUrl,
  generateImageId,
} from "@/lib/storage/s3";
import OpenAI from "openai";
import { getSystemPrompt } from "./system-prompts";
import { recordEvent, sanitizeGeminiResponse } from "@/lib/telemetry";
import {
  editImageWithModel,
  generateImageWithModel,
} from "@/lib/image/service";
import { getImageModel } from "@/lib/image/models";
import {
  DEFAULT_VIDEO_MODEL_ID,
  getVideoModel,
  getModelConfigForApi,
  getVideoModelsPromptText,
} from "@/lib/video/models";
import { calculateCost } from "@/lib/pricing";
import { deductCredits, getUserBalance, InsufficientCreditsError } from "@/lib/credits";
import {
  fetchTaxonomyTree,
  serializeTaxonomyForLLM,
  parseToolCallBody,
} from "./taxonomy-tool";
import {
  validateBufferTags,
  extractTag,
  VALID_TAGS,
} from "./parse-agent-output";

// Maximum number of retries for failed operations
const MAX_RETRY = 2;

// Maximum number of user messages to send to AI (excluding the first user message)
const MAX_USER_MESSAGES = 15;

// Supported aspect ratios for Gemini image generation
const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

type AspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];
const SUPPORTED_IMAGE_SIZES: ImageSize[] = ["2k", "4k"];

interface Suggestion {
  title: string;
  aspectRatio: string;
  prompt: string;
}

interface AgentOutput {
  question: string;
  suggestions: Suggestion[];
}

/** Reference image with tag for context */
interface ReferenceImageEntry {
  imageId: string;
  tag: "none" | "subject" | "scene" | "item" | "style";
  title?: string;
}

interface PreparedMessages {
  messages: any[];
  /** All image IDs provided in the request (from user uploads, asset library, or AI-generated selections) */
  imageIds: string[];
  /** Pre-fetched base64 data for all images (used for image editing/generation) */
  imageBase64Promises: Promise<string | undefined>[];
  precisionEditing?: boolean;
  aspectRatioOverride?: AspectRatio;
  imageSizeOverride?: ImageSize;
  imageModelId?: string;
}

/** Mutable state shared across the stream parsing pipeline. */
interface ParseState {
  buffer: string;
  fullLlmResponse: string;
  thoughtSent: boolean;
  questionSent: boolean;
  suggestionIndex: number;
  shotListStartSent: boolean;
  imageTasks: Promise<void>[];
  finalContent: MessageContentPart[];
}

/** Hard cap on the number of image suggestions the agent can generate. */
const MAX_SUGGESTIONS_HARD_CAP = 6;

/** Immutable context passed to all parsing helpers. */
interface ParseContext {
  prepared: PreparedMessages;
  startTime: number;
  send: (data: any) => void;
  userId: string;
  agent: Agent1;
  maxSuggestions: number;
}

export class Agent1 implements Agent {
  id = "agent-1";
  name = "Creative Assistant (Gemini)";

  async processRequest(
    history: Message[],
    userMessage: Message,
    userId: string,
    isAdmin: boolean,
    requestStartTime?: number,
    precisionEditing?: boolean,
    imageIds?: string[], // Unified array of image IDs
    systemPromptOverride?: string,
    aspectRatioOverride?: string,
    imageSizeOverride?: ImageSize,
    imageModelId?: string,
    maxImageQuantity?: number // User-selected max image quantity (undefined = smart/agent decides)
  ): Promise<AgentResponse> {
    const startTime = requestStartTime || Date.now();
    console.log(
      "[Perf] Agent processRequest start",
      `[${Date.now() - startTime}ms]`
    );

    // Validate aspect ratio override - if invalid, fall back to smart mode (undefined)
    let validatedAspectRatio: AspectRatio | undefined;
    if (aspectRatioOverride) {
      if (
        SUPPORTED_ASPECT_RATIOS.includes(aspectRatioOverride as AspectRatio)
      ) {
        validatedAspectRatio = aspectRatioOverride as AspectRatio;
        console.log(
          `[Agent-1] User selected aspect ratio: ${validatedAspectRatio}`
        );
      } else {
        console.log(
          `[Agent-1] Invalid aspect ratio "${aspectRatioOverride}" provided, falling back to smart mode`
        );
      }
    }

    let validatedImageSize: ImageSize | undefined;
    if (imageSizeOverride) {
      if (SUPPORTED_IMAGE_SIZES.includes(imageSizeOverride)) {
        validatedImageSize = imageSizeOverride;
        console.log(`[Agent-1] User selected image size: ${validatedImageSize}`);
      } else {
        console.log(
          `[Agent-1] Invalid image size "${imageSizeOverride}" provided, falling back to 2k`
        );
      }
    }

    // Step 1: Prepare messages
    const prepared = await this.prepareMessages(
      history,
      userMessage,
      startTime,
      precisionEditing,
      imageIds || [],
      systemPromptOverride,
      validatedAspectRatio,
      validatedImageSize,
      imageModelId,
      undefined, // referenceImages
      maxImageQuantity
    );

    // Determine effective max suggestions: user selection capped at hard limit
    const effectiveMaxSuggestions = maxImageQuantity
      ? Math.min(maxImageQuantity, MAX_SUGGESTIONS_HARD_CAP)
      : MAX_SUGGESTIONS_HARD_CAP;

    // Step 2: Call LLM and parse response
    const { stream, completion } = await this.callLLMAndParse(
      prepared,
      startTime,
      isAdmin,
      userId,
      effectiveMaxSuggestions
    );

    return { stream, completion };
  }

  /**
   * Filter conversation history to keep only the first user message, first assistant message,
   * and the last N user messages (and their subsequent messages)
   * @param history Array of messages to filter
   * @returns Filtered array of messages
   */
  private filterMessagesByUserCount(history: Message[]): Message[] {
    if (history.length === 0) {
      return history;
    }

    // Find indices of all user messages
    const userMessageIndices: number[] = [];
    for (let i = 0; i < history.length; i++) {
      if (history[i].role === "user") {
        userMessageIndices.push(i);
      }
    }

    // If we have fewer user messages than the limit + 1 (first user), return all
    if (userMessageIndices.length <= MAX_USER_MESSAGES + 1) {
      return history;
    }

    // Find the index of the first user message
    const firstUserIndex = userMessageIndices[0];

    // Find the index of the first assistant message (should be after first user)
    let firstAssistantIndex = -1;
    for (let i = firstUserIndex + 1; i < history.length; i++) {
      if (history[i].role === "assistant") {
        firstAssistantIndex = i;
        break;
      }
    }

    // If no assistant message found after first user, just return all
    if (firstAssistantIndex === -1) {
      return history;
    }

    // Find the index of the Nth user message from the end (where N = MAX_USER_MESSAGES)
    // We want to keep the last MAX_USER_MESSAGES user messages, so we find the (MAX_USER_MESSAGES)th from the end
    const cutoffUserMessageIndex =
      userMessageIndices[userMessageIndices.length - MAX_USER_MESSAGES];

    // Keep: [0...firstAssistantIndex] + [cutoffUserMessageIndex...end]
    const filteredHistory = [
      ...history.slice(0, firstAssistantIndex + 1),
      ...history.slice(cutoffUserMessageIndex),
    ];

    return filteredHistory;
  }

  private async prepareMessages(
    history: Message[],
    userMessage: Message,
    startTime: number,
    precisionEditing?: boolean,
    imageIds?: string[], // Unified array of image IDs from frontend
    systemPromptOverride?: string,
    aspectRatioOverride?: AspectRatio,
    imageSizeOverride?: ImageSize,
    imageModelId?: string,
    referenceImages?: ReferenceImageEntry[], // Reference images with tags
    maxImageQuantity?: number // User-selected image quantity (undefined = smart/agent decides)
  ): Promise<PreparedMessages> {
    const rawSystemPrompt = systemPromptOverride || getSystemPrompt(this.id);
    const systemPrompt = rawSystemPrompt
      .replace("{{SUPPORTED_ASPECT_RATIOS}}", SUPPORTED_ASPECT_RATIOS.join(", "))
      .replace("{{VIDEO_MODELS_INFO}}", getVideoModelsPromptText());

    // Convert previous agent_image and agent_video parts to text in history
    const cleanHistory = history.map((m) => {
      if (Array.isArray(m.content)) {
        return {
          ...m,
          content: m.content.map((p) => {
            if (p.type === "agent_image" || p.type === "direct_image") {
              return {
                type: "text" as const,
                text: `[Image ID: ${p.imageId || "unknown"}] Suggestion: ${p.title}\nAspect Ratio: ${p.aspectRatio || "1:1"
                  }\nPrompt: ${p.prompt}`,
              };
            }
            if (p.type === "agent_video") {
              return {
                type: "text" as const,
                text: `[Video Configuration: ${p.config.modelName} - "${p.config.prompt}" - Status: ${p.status}${p.generationId ? ` (Generation ID: ${p.generationId})` : ""}]`,
              };
            }
            if (p.type === "agent_shot_list") {
              const header = p.columns.join(" | ");
              const rows = p.rows
                .map((r) => r.cells.map((c) => c.value).join(" | "))
                .join("\n");
              return {
                type: "text" as const,
                text: `[Shot List: ${p.title}]\n${header}\n${rows}`,
              };
            }
            if (p.type === "agent_search") {
              return {
                type: "text" as const,
                text: `[Search executed: text="${p.query.textSearch}", filters=${JSON.stringify(p.query.filterIds)}]`,
              };
            }
            if (p.type === "tool_call") {
              return {
                type: "text" as const,
                text: `[Tool call: ${p.tool} — ${p.status}]`,
              };
            }
            return p;
          }),
        };
      }
      return m;
    });

    // Filter history to keep only the first user message, first assistant message, and last N user messages
    const filteredHistory = this.filterMessagesByUserCount(cleanHistory);

    if (cleanHistory.length !== filteredHistory.length) {
      console.log(
        `[Agent-1] Conversation history filtered: ${cleanHistory.length} → ${filteredHistory.length} messages (keeping first user + first assistant + last ${MAX_USER_MESSAGES} user messages)`
      );
    }

    // Get all image IDs from the current user message (these are already in imageIds from frontend)
    // The imageIds parameter contains all images the user wants to use for this request
    const pendingImageIds = imageIds || [];
    
    // Combine pending images and reference images for image generation
    const referenceImageIds = referenceImages?.map((ref) => ref.imageId) || [];
    const allImageIds = [...pendingImageIds, ...referenceImageIds];

    // Pre-fetch all image base64 data in parallel (for both pending and reference images, used for image generation)
    const imageBase64Promises = allImageIds.map((id) =>
      downloadImage(id).then((buf) => buf?.toString("base64"))
    );

    console.log(
      "[Perf] %s image base64 downloads started (%s pending + %s reference) [%sms]",
      allImageIds.length,
      pendingImageIds.length,
      referenceImageIds.length,
      Date.now() - startTime
    );

    const formattedUserMessage: any = {
      role: userMessage.role,
      content: Array.isArray(userMessage.content)
        ? userMessage.content.flatMap((p) => {
          if (p.type === "image") {
            return [
              {
                type: "text" as const,
                text: `[Image ID: ${p.imageId}${p.title ? ` | Title: ${p.title}` : ""}]`,
              },
              {
                type: "image_url" as const,
                image_url: {
                  url: getSignedImageUrl(p.imageId),
                },
              },
            ];
          }
          return [p];
        })
        : [
          { type: "text", text: userMessage.content as string },
        ],
    };

    // Add reference images with their tags to the user message
    if (referenceImages && referenceImages.length > 0) {
      // Ensure content is an array
      if (!Array.isArray(formattedUserMessage.content)) {
        formattedUserMessage.content = [{ type: "text", text: formattedUserMessage.content }];
      }
      
      for (const ref of referenceImages) {
        const tagLabel = ref.tag === "none" ? "general reference" : ref.tag;
        formattedUserMessage.content.push({
          type: "text",
          text: `[Reference Image ID: ${ref.imageId} - ${tagLabel}${ref.title ? `: ${ref.title}` : ""}]`,
        });
        formattedUserMessage.content.push({
          type: "image_url",
          image_url: {
            url: getSignedImageUrl(ref.imageId),
          },
        });
      }
      
      console.log(
        `[Agent-1] Added ${referenceImages.length} reference image(s) with tags to user message`
      );
    }

    // Add precision editing prompt if applicable
    if (precisionEditing && allImageIds.length > 0) {
      if (Array.isArray(formattedUserMessage.content)) {
        formattedUserMessage.content.push({
          type: "text",
          text: "\nPrecision Editing on. Make sure that your prompt is describing an edit to the picture(s).",
        });
      }
    }

    // Add image quantity instruction if user selected a specific number
    if (maxImageQuantity && maxImageQuantity >= 1 && maxImageQuantity <= MAX_SUGGESTIONS_HARD_CAP) {
      if (!Array.isArray(formattedUserMessage.content)) {
        formattedUserMessage.content = [{ type: "text", text: formattedUserMessage.content as string }];
      }
      formattedUserMessage.content.push({
        type: "text",
        text: `\nGenerate exactly ${maxImageQuantity} image suggestion${maxImageQuantity === 1 ? "" : "s"}.`,
      });
      console.log(`[Agent-1] User selected image quantity: ${maxImageQuantity}`);
    }

    // Find last think part location in filteredHistory
    let lastThinkMessageIndex = -1;
    let lastThinkPartIndex = -1;

    for (let i = 0; i < filteredHistory.length; i++) {
      const msg = filteredHistory[i];
      if (Array.isArray(msg.content)) {
        for (let j = 0; j < msg.content.length; j++) {
          if (msg.content[j].type === "internal_think") {
            lastThinkMessageIndex = i;
            lastThinkPartIndex = j;
          }
        }
      }
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...filteredHistory.map((m, mIdx) => {
        if (Array.isArray(m.content)) {
          // Filter and transform content parts
          const newContent = m.content
            .map((c, pIdx) => {
              if (c.type === "image") {
                return {
                  type: "text",
                  text: `[User provided an image in this message | Image ID: ${c.imageId}${c.title ? ` | Title: ${c.title}` : ""}]`,
                };
              }
              if (c.type === "internal_think") {
                // Only keep the latest think part and convert it to text
                if (
                  mIdx === lastThinkMessageIndex &&
                  pIdx === lastThinkPartIndex
                ) {
                  return {
                    type: "text",
                    text: `(agent thinking process)\n${c.text}`,
                  };
                }
                // Filter out other think parts
                return null;
              }
              return c;
            })
            .filter((c) => c !== null); // Remove nulls

          return {
            role: m.role,
            content: newContent,
          };
        }
        return m;
      }),
      formattedUserMessage,
    ];
    console.log(
      "[Perf] Agent messages prepared",
      `[${Date.now() - startTime}ms]`
    );

    return {
      messages,
      imageIds: allImageIds,
      imageBase64Promises,
      precisionEditing,
      aspectRatioOverride,
      imageSizeOverride,
      imageModelId,
    };
  }

  private async callLLMAndParse(
    prepared: PreparedMessages,
    startTime: number,
    isAdmin: boolean,
    userId: string,
    maxSuggestions: number = MAX_SUGGESTIONS_HARD_CAP
  ): Promise<AgentResponse> {
    const encoder = new TextEncoder();
    let resolveCompletion: (value: Message) => void;
    let rejectCompletion: (error: Error) => void;
    const completion = new Promise<Message>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    let currentAttempt = 0;
    const self = this;

    // Create a wrapper stream that handles retries
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            // Only stream internal_* to admins
            if (data.type?.startsWith("internal_") && !isAdmin) {
              return;
            }
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          } catch (e) {
            // Controller might be closed
          }
        };

        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
          try {
            if (attempt > 0) {
              console.log(
                `[Agent-1] Retrying LLM call and parse, attempt ${attempt + 1
                }/${MAX_RETRY + 1}`
              );

              // Send invalidation signal to frontend before retry
              send({ type: "invalidate", reason: "retry" });

              // Append format reminder to the last user message on retry
              const lastMessage =
                prepared.messages[prepared.messages.length - 1];
              if (lastMessage && lastMessage.role === "user") {
                if (Array.isArray(lastMessage.content)) {
                  // Add reminder as text part
                  lastMessage.content.push({
                    type: "text",
                    text: "\n\nPlease remember to follow the required format with <TEXT> and <JSON> tags as specified in the system prompt.",
                  });
                } else if (typeof lastMessage.content === "string") {
                  // Append to string content
                  lastMessage.content +=
                    "\n\nPlease remember to follow the required format with <TEXT> and <JSON> tags as specified in the system prompt.";
                }
              }
            }

            const result = await self.callLLMAndParseCore(
              prepared,
              startTime,
              send,
              userId,
              maxSuggestions
            );

            if (attempt > 0) {
              console.log(
                `[Agent-1] LLM call and parse succeeded on retry attempt ${attempt + 1
                }`
              );
            }

            // Success - resolve completion and close controller
            resolveCompletion(result);
            controller.close();
            return;
          } catch (error) {
            lastError = error as Error;
            console.error(
              `[Agent-1] LLM call and parse attempt ${attempt + 1}/${MAX_RETRY + 1
              } failed:`,
              error
            );
          }
        }

        // All retries exhausted - send failure signal to frontend
        console.error(
          `[Agent-1] LLM call and parse failed after ${MAX_RETRY + 1} attempts`
        );

        // Send retry exhausted signal so frontend can restore user input
        send({
          type: "retry_exhausted",
          reason: "All retry attempts failed",
          error: lastError?.message || "Unknown error",
        });

        rejectCompletion(lastError || new Error("LLM call and parse failed"));
        try {
          controller.close();
        } catch (e) { }
      },
    });

    return { stream, completion };
  }

  private async callLLMAndParseCore(
    prepared: PreparedMessages,
    startTime: number,
    send: (data: any) => void,
    userId: string,
    maxSuggestions: number = MAX_SUGGESTIONS_HARD_CAP
  ): Promise<Message> {
    console.log("prepared.messages", JSON.stringify(prepared.messages, null, 2));

    const llmStream = await new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    }).chat.completions.create({
      model: DEFAULT_LLM_MODEL,
      messages: prepared.messages as any,
      stream: true,
    });
    console.log("[Perf] Agent LLM stream started", `[${Date.now() - startTime}ms]`);

    const state: ParseState = {
      buffer: "",
      fullLlmResponse: "",
      thoughtSent: false,
      questionSent: false,
      suggestionIndex: 0,
      shotListStartSent: false,
      imageTasks: [],
      finalContent: [],
    };
    const ctx: ParseContext = { prepared, startTime, send, userId, agent: this, maxSuggestions };

    try {
      await this.consumeLLMStream(llmStream, state, ctx);

      await Promise.all(state.imageTasks);

      console.log("=== FINAL AI LLM RESPONSE ===");
      console.log(state.fullLlmResponse);
      console.log("=== END FINAL AI LLM RESPONSE ===");

      if (state.finalContent.length === 0) {
        const text = state.buffer.replace(/<[^>]*>/g, "").trim();
        if (text) {
          send({ type: "text", content: text });
          state.finalContent.push({ type: "text", text });
        }
      }

      return {
        role: "assistant",
        content: state.finalContent,
        agentId: "agent-1",
      };
    } catch (err) {
      console.error("Stream processing error", err);
      throw err;
    }
  }

  // --- Shared parsing helpers called by consumeLLMStream ---

  private parseThought(state: ParseState, ctx: ParseContext): void {
    if (state.thoughtSent) return;
    const result = extractTag(state.buffer, "think");
    if (!result) return;

    const thoughtText = result.content.trim();
    ctx.send({ type: "internal_think", content: thoughtText });
    console.log("[Perf] Agent thought sent", `[${Date.now() - ctx.startTime}ms]`);
    state.finalContent.push({ type: "internal_think", text: thoughtText });
    state.thoughtSent = true;
    state.buffer = result.rest;
  }

  private parseText(state: ParseState, ctx: ParseContext): void {
    if (state.questionSent) return;
    const result = extractTag(state.buffer, "TEXT");
    if (!result) return;

    const questionText = result.content.trim();
    ctx.send({ type: "text", content: questionText });
    console.log("[Perf] Agent question sent", `[${Date.now() - ctx.startTime}ms]`);
    state.finalContent.push({ type: "text", text: questionText });
    state.questionSent = true;
    state.buffer = result.rest;
  }

  private parseSuggestions(state: ParseState, ctx: ParseContext): void {
    while (state.buffer.includes("</JSON>")) {
      const result = extractTag(state.buffer, "JSON");
      if (!result) break;

      try {
        const suggestion = JSON.parse(result.content);

        if (state.suggestionIndex < ctx.maxSuggestions) {
          const currentIndex = state.suggestionIndex;
          state.suggestionIndex++;
          const trackingImageId = generateImageId();

          const task = (async () => {
            try {
              const placeholder: MessageContentPart = {
                type: "agent_image",
                imageId: trackingImageId,
                title: "Loading...",
                aspectRatio: suggestion.aspectRatio as AspectRatio,
                prompt: suggestion.prompt,
                status: "loading",
              };
              ctx.send({ type: "part", part: placeholder });
              state.finalContent.push(placeholder);

              console.log(
                "[Perf] Agent image generation start",
                `[${Date.now() - ctx.startTime}ms]`,
                `imageId=${trackingImageId}`
              );
              const part = await ctx.agent.generateImage(
                suggestion, ctx.prepared, currentIndex, ctx.startTime, ctx.userId, trackingImageId
              );

              ctx.send({ type: "part_update", imageId: trackingImageId, part });
              const idx = state.finalContent.findIndex(
                (p) => p.type === "agent_image" && p.imageId === trackingImageId
              );
              if (idx !== -1) state.finalContent[idx] = part;
            } catch (err) {
              console.error(`Image gen error for imageId ${trackingImageId}`, err);
              const isInsufficientCredits = err instanceof InsufficientCreditsError;
              const errorPart: MessageContentPart = {
                type: "agent_image",
                imageId: trackingImageId,
                title: suggestion.title || "Error",
                aspectRatio: "1:1",
                prompt: suggestion.prompt || "",
                status: "error",
                ...(isInsufficientCredits && { reason: "INSUFFICIENT_CREDITS" }),
              };
              ctx.send({ type: "part_update", imageId: trackingImageId, part: errorPart });
              const idx = state.finalContent.findIndex(
                (p) => p.type === "agent_image" && p.imageId === trackingImageId
              );
              if (idx !== -1) state.finalContent[idx] = errorPart;
            }
          })();

          state.imageTasks.push(task);
        } else {
          console.log(`[Agent-1] Skipping suggestion beyond limit of ${ctx.maxSuggestions}. Title: ${suggestion.title}`);
        }
      } catch (e) {
        console.error("Failed to parse suggestion JSON", e);
        throw new Error(`JSON parsing failed: ${e}`);
      }
      state.buffer = result.rest;
    }
  }

  private parseVideo(state: ParseState, ctx: ParseContext): void {
    if (!state.buffer.includes("</VIDEO>")) return;
    const result = extractTag(state.buffer, "VIDEO");
    if (!result) return;

    try {
      const videoConfig = JSON.parse(result.content);
      const modelId =
        typeof videoConfig.modelId === "string" && getVideoModel(videoConfig.modelId)
          ? videoConfig.modelId
          : DEFAULT_VIDEO_MODEL_ID;
      const model = getVideoModel(modelId);
      const modelApiConfig = getModelConfigForApi(modelId);

      if (model && modelApiConfig) {
        const videoParams: Record<string, any> = {};
        for (const param of modelApiConfig.params) {
          if (
            param.name === "prompt" ||
            param.name === model.imageParams.sourceImage ||
            param.name === model.imageParams.endImage
          ) continue;
          if (videoConfig[param.name] !== undefined) {
            videoParams[param.name] = videoConfig[param.name];
          } else if (param.default !== undefined) {
            videoParams[param.name] = param.default;
          }
        }

        const videoPart: MessageContentPart = {
          type: "agent_video",
          config: {
            modelId,
            modelName: model.name,
            prompt: videoConfig.prompt || "",
            sourceImageId: typeof videoConfig.sourceImageId === "string" ? videoConfig.sourceImageId : undefined,
            params: videoParams,
          },
          status: "pending",
        };

        ctx.send({ type: "part", part: videoPart });
        state.finalContent.push(videoPart);
        console.log("[Perf] Agent video config sent", `model=${model.name}`, `[${Date.now() - ctx.startTime}ms]`);
      }
    } catch (e) {
      console.error("Failed to parse video config JSON", e);
    }
    state.buffer = result.rest;
  }

  private parseShotList(state: ParseState, ctx: ParseContext): void {
    if (!state.shotListStartSent && state.buffer.includes("<SHOTLIST>")) {
      state.shotListStartSent = true;
      ctx.send({ type: "shot_list_start" });
      console.log("[Perf] Agent shot list generation started", `[${Date.now() - ctx.startTime}ms]`);
    }

    if (!state.buffer.includes("</SHOTLIST>")) return;
    const result = extractTag(state.buffer, "SHOTLIST");
    if (!result) return;

    try {
      const shotListData = JSON.parse(result.content);
      const shotListPart: MessageContentPart = {
        type: "agent_shot_list",
        title: shotListData.title || "Shot List",
        columns: Array.isArray(shotListData.columns) ? shotListData.columns : [],
        rows: Array.isArray(shotListData.rows) ? shotListData.rows : [],
        status: "complete",
      };

      ctx.send({ type: "part", part: shotListPart });
      state.finalContent.push(shotListPart);
      console.log("[Perf] Agent shot list sent", `rows=${shotListPart.rows.length}`, `[${Date.now() - ctx.startTime}ms]`);
    } catch (e) {
      console.error("Failed to parse shot list JSON", e);
    }
    state.buffer = result.rest;
  }

  private parseSearch(state: ParseState, ctx: ParseContext): void {
    if (!state.buffer.includes("</SEARCH>")) return;
    const result = extractTag(state.buffer, "SEARCH");
    if (!result) return;

    try {
      const searchData = JSON.parse(result.content);
      const searchPart: MessageContentPart = {
        type: "agent_search",
        query: {
          textSearch: typeof searchData.text === "string" ? searchData.text : "",
          filterIds: Array.isArray(searchData.filters) ? searchData.filters : [],
        },
        status: "pending",
      };

      ctx.send({ type: "part", part: searchPart });
      state.finalContent.push(searchPart);
      console.log(
        "[Perf] Agent search query sent",
        `text="${searchPart.query.textSearch}"`,
        `filters=${JSON.stringify(searchPart.query.filterIds)}`,
        `[${Date.now() - ctx.startTime}ms]`
      );
    } catch (e) {
      console.error("Failed to parse search JSON", e);
    }
    state.buffer = result.rest;
  }

  private async handleToolCall(
    state: ParseState,
    ctx: ParseContext,
  ): Promise<boolean> {
    if (!state.buffer.includes("</TOOL_CALL>")) return false;
    const result = extractTag(state.buffer, "TOOL_CALL");
    if (!result) return false;

    let toolCall;
    try {
      toolCall = parseToolCallBody(result.content.trim());
    } catch (e) {
      console.error("Failed to parse tool call JSON", e);
      state.buffer = result.rest;
      return false;
    }

    if (toolCall.tool !== "CHECK_TAXONOMY") {
      state.buffer = result.rest;
      return false;
    }

    console.log(`[Agent-1] Tool call detected: CHECK_TAXONOMY lang=${toolCall.lang}`, `[${Date.now() - ctx.startTime}ms]`);

    ctx.send({ type: "tool_call", tool: "check_taxonomy", status: "loading" });
    state.finalContent.push({ type: "tool_call", tool: "check_taxonomy", status: "loading" });

    const partialResponse = state.fullLlmResponse.substring(0, state.fullLlmResponse.indexOf("<TOOL_CALL>"));

    const taxonomyTree = await fetchTaxonomyTree(toolCall.lang);
    const serialized = serializeTaxonomyForLLM(taxonomyTree);
    console.log(`[Agent-1] Taxonomy tree fetched: ${serialized.length} chars`, `[${Date.now() - ctx.startTime}ms]`);

    ctx.send({ type: "tool_call", tool: "check_taxonomy", status: "complete" });
    const toolCallIdx = state.finalContent.findIndex(
      (p) => p.type === "tool_call" && (p as any).status === "loading"
    );
    if (toolCallIdx !== -1) {
      state.finalContent[toolCallIdx] = { type: "tool_call", tool: "check_taxonomy", status: "complete" };
    }

    const continuationMessages = [
      ...ctx.prepared.messages,
      { role: "assistant", content: partialResponse.trim() },
      {
        role: "user",
        content: `[System: Tool call result for CHECK_TAXONOMY]\n\nHere is the taxonomy tree. Each selectable item has an [id:NUMBER] prefix. Use these IDs in your <SEARCH> filters and taxonomy: links.\n\n${serialized}`,
      },
    ];

    const continuationStream = await new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    }).chat.completions.create({
      model: DEFAULT_LLM_MODEL,
      messages: continuationMessages as any,
      stream: true,
    });

    console.log("[Perf] Agent continuation LLM stream started after tool call", `[${Date.now() - ctx.startTime}ms]`);

    state.buffer = "";
    state.fullLlmResponse = "";
    state.thoughtSent = true;
    state.questionSent = false;
    state.suggestionIndex = 0;
    state.shotListStartSent = false;

    await this.consumeLLMStream(continuationStream, state, ctx);
    return true;
  }

  private async consumeLLMStream(
    llmStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    state: ParseState,
    ctx: ParseContext,
  ): Promise<void> {
    for await (const chunk of llmStream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      state.buffer += delta;
      state.fullLlmResponse += delta;

      validateBufferTags(state.buffer);

      this.parseThought(state, ctx);

      const toolCallHandled = await this.handleToolCall(state, ctx);
      if (toolCallHandled) return;

      this.parseText(state, ctx);
      this.parseSuggestions(state, ctx);
      this.parseVideo(state, ctx);
      this.parseShotList(state, ctx);
      this.parseSearch(state, ctx);
    }
  }

  private async generateImage(
    suggestion: Suggestion,
    prepared: PreparedMessages,
    index: number,
    startTime: number,
    userId: string,
    preGeneratedImageId?: string
  ): Promise<MessageContentPart> {
    console.log(
      `[Perf] Image generation start index=${index}`,
      `[${Date.now() - startTime}ms]`,
      preGeneratedImageId ? `imageId=${preGeneratedImageId}` : ""
    );

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `[Agent-1] Retrying image generation for index=${index}, attempt ${attempt + 1
            }/${MAX_RETRY + 1}`
          );
        }

        const result = await this.generateImageCore(
          suggestion,
          prepared,
          index,
          startTime,
          userId,
          preGeneratedImageId
        );

        if (attempt > 0) {
          console.log(
            `[Agent-1] Image generation succeeded on retry attempt ${attempt + 1
            } for index=${index}`
          );
        }

        return result;
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          throw error;
        }
        lastError = error as Error;
        console.error(
          `[Agent-1] Image generation attempt ${attempt + 1}/${MAX_RETRY + 1
          } failed for index=${index}:`,
          error
        );
      }
    }

    // All retries exhausted
    console.error(
      `[Agent-1] Image generation failed after ${MAX_RETRY + 1
      } attempts for index=${index}`
    );

    // Record failure event
    const modelConfig = prepared.imageModelId
      ? getImageModel(prepared.imageModelId)
      : undefined;
    const failureMetadata: any = {
      status: "failed",
      provider: modelConfig?.provider || "unknown",
      modelId: prepared.imageModelId,
      error: lastError?.message || "Image generation failed",
      prompt: suggestion.prompt,
      aspectRatio: suggestion.aspectRatio,
      imageSize: prepared.imageSizeOverride || "2k",
    };

    if (lastError && "response" in lastError) {
      const response = (lastError as any).response;
      failureMetadata.response = sanitizeGeminiResponse(response);
    }

    await recordEvent("image_generation", userId, failureMetadata);

    throw lastError || new Error("Image generation failed");
  }

  private async generateImageCore(
    suggestion: Suggestion,
    prepared: PreparedMessages,
    index: number,
    startTime: number,
    userId: string,
    preGeneratedImageId?: string
  ): Promise<MessageContentPart> {
    // Use user-selected aspect ratio if provided, otherwise use agent's suggestion
    // If agent's suggestion is also invalid, fall back to "1:1"
    let aspectRatio: AspectRatio;
    if (prepared.aspectRatioOverride) {
      aspectRatio = prepared.aspectRatioOverride;
      console.log(
        `[Agent-1] Using user-selected aspect ratio: ${aspectRatio} for image ${index}`
      );
    } else if (
      SUPPORTED_ASPECT_RATIOS.includes(suggestion.aspectRatio as AspectRatio)
    ) {
      aspectRatio = suggestion.aspectRatio as AspectRatio;
    } else {
      aspectRatio = "1:1";
    }
    const imageSize = prepared.imageSizeOverride || "2k";

    let finalImageId: string;

    // Await all image base64 data
    const imageBase64Data = await Promise.all(prepared.imageBase64Promises);

    // Filter out undefined values and get valid base64 strings
    const validImageBase64: string[] = imageBase64Data.filter(
      (data): data is string => data !== undefined
    );

    // Determine if we should use image editing (if we have any images and precision editing is on)
    // or if we have images at all (for image-to-image generation)
    const useImageEditing =
      (prepared.precisionEditing && validImageBase64.length > 0) ||
      validImageBase64.length > 0;

    try {
      const modelId = prepared.imageModelId;

      // Calculate cost and verify balance before generating
      const cost = await calculateCost("Image/all", {});
      if (cost > 0) {
        const balance = await getUserBalance(userId);
        if (balance < cost) {
          throw new InsufficientCreditsError();
        }
      }

      let result;
      if (useImageEditing && validImageBase64.length > 0) {
        console.log(
          `[Agent-1] Using image editing mode with ${validImageBase64.length} image(s) for index=${index}`
        );
        result = await editImageWithModel(modelId, {
          prompt: suggestion.prompt,
          imageIds: prepared.imageIds,
          imageBase64: validImageBase64,
          aspectRatio,
          imageSize,
        });
      } else {
        result = await generateImageWithModel(modelId, {
          prompt: suggestion.prompt,
          aspectRatio,
          imageSize,
        });
      }

      // Use pre-generated imageId if provided (for parallel tracking), otherwise generate new
      finalImageId = await uploadImage(
        result.imageBuffer,
        result.contentType,
        preGeneratedImageId
      );

      // Deduct credits only after successful generation
      if (cost > 0) {
        await deductCredits(
          userId,
          cost,
          "image_generation",
          `Image generation (${modelId || "default"})`
        );
      }

      const response =
        result.provider === "google"
          ? sanitizeGeminiResponse(result.response)
          : result.response;

      // Record success event
      await recordEvent("image_generation", userId, {
        status: "success",
        provider: result.provider,
        modelId: result.modelId,
        providerModelId: result.providerModelId,
        prompt: suggestion.prompt,
        aspectRatio: aspectRatio,
        imageSize,
        response,
      });
    } catch (error) {
      // If we have a response in the error (from our manual throw above), or if it's a GoogleGenerativeAIError that contains response data
      // we want to ensure it propagates up
      throw error;
    }

    const result: MessageContentPart = {
      type: "agent_image",
      imageId: finalImageId,
      imageUrl: getSignedImageUrl(finalImageId),
      title: suggestion.title,
      aspectRatio: aspectRatio,
      prompt: suggestion.prompt,
      status: "generated",
    };
    console.log(
      `[Perf] Image generation end index=${index}`,
      `[${Date.now() - startTime}ms]`,
      `imageId=${finalImageId}`
    );
    return result;
  }

  /**
   * Process request with parallel variants - runs N parallel LLM calls
   * and merges their streams into a single stream with variant IDs
   */
  async processRequestParallel(
    history: Message[],
    userMessage: Message,
    userId: string,
    isAdmin: boolean,
    variantCount: number,
    requestStartTime?: number,
    precisionEditing?: boolean,
    imageIds?: string[], // Unified array of image IDs to use for generation
    systemPromptOverride?: string,
    aspectRatioOverride?: string,
    imageSizeOverride?: ImageSize,
    imageModelId?: string,
    messageTimestamp?: number, // Timestamp to use for all variants (for frontend sync)
    referenceImages?: ReferenceImageEntry[], // Reference images with tags
    maxImageQuantity?: number // User-selected max image quantity (undefined = smart/agent decides)
  ): Promise<ParallelAgentResponse> {
    const startTime = requestStartTime || Date.now();
    // Use provided timestamp or generate one
    const variantTimestamp = messageTimestamp || Date.now();
    console.log(
      "[Perf] Agent processRequestParallel start with %s variants, %s images, %s reference images [%sms]",
      variantCount,
      imageIds?.length || 0,
      referenceImages?.length || 0,
      Date.now() - startTime
    );

    // Validate aspect ratio override
    let validatedAspectRatio: AspectRatio | undefined;
    if (aspectRatioOverride) {
      if (
        SUPPORTED_ASPECT_RATIOS.includes(aspectRatioOverride as AspectRatio)
      ) {
        validatedAspectRatio = aspectRatioOverride as AspectRatio;
      }
    }

    let validatedImageSize: ImageSize | undefined;
    if (imageSizeOverride) {
      if (SUPPORTED_IMAGE_SIZES.includes(imageSizeOverride)) {
        validatedImageSize = imageSizeOverride;
      }
    }

    // Prepare messages once (shared across all variants)
    const prepared = await this.prepareMessages(
      history,
      userMessage,
      startTime,
      precisionEditing,
      imageIds || [],
      systemPromptOverride,
      validatedAspectRatio,
      validatedImageSize,
      imageModelId,
      referenceImages,
      maxImageQuantity
    );

    // Determine effective max suggestions: user selection capped at hard limit
    const effectiveMaxSuggestions = maxImageQuantity
      ? Math.min(maxImageQuantity, MAX_SUGGESTIONS_HARD_CAP)
      : MAX_SUGGESTIONS_HARD_CAP;

    const encoder = new TextEncoder();
    const self = this;

    // Generate unique variant IDs
    const variantIds = Array.from(
      { length: variantCount },
      (_, i) =>
        `variant-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    // Track completion for each variant
    const completionPromises: Promise<Message>[] = [];
    const variantControllers: {
      controller: ReadableStreamDefaultController<Uint8Array> | null;
      done: boolean;
    }[] = variantIds.map(() => ({ controller: null, done: false }));

    // Create merged stream
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Send the message timestamp first so frontend can sync
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "message_timestamp", timestamp: variantTimestamp }) + "\n"
          )
        );

        // Start all parallel variant processing
        variantIds.forEach((variantId, variantIndex) => {
          const completionPromise = (async () => {
            const send = (data: any) => {
              try {
                // Only stream internal_* to admins
                if (data.type?.startsWith("internal_") && !isAdmin) {
                  return;
                }
                // Add variantId to all events
                const eventWithVariant = { ...data, variantId };
                controller.enqueue(
                  encoder.encode(JSON.stringify(eventWithVariant) + "\n")
                );
              } catch (e) {
                // Controller might be closed
              }
            };

            let lastError: Error | undefined;

            for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
              try {
                if (attempt > 0) {
                  console.log(
                    `[Agent-1] Retrying LLM call for variant ${variantId}, attempt ${attempt + 1}/${MAX_RETRY + 1}`
                  );
                  send({ type: "invalidate", reason: "retry" });
                }

                const result = await self.callLLMAndParseCore(
                  prepared,
                  startTime,
                  send,
                  userId,
                  effectiveMaxSuggestions
                );

                // Add variantId and createdAt to the result message
                const messageWithVariant: Message = {
                  ...result,
                  variantId,
                  createdAt: variantTimestamp,
                };

                variantControllers[variantIndex].done = true;

                // Check if all variants are done
                if (variantControllers.every((v) => v.done)) {
                  try {
                    controller.close();
                  } catch (e) { }
                }

                return messageWithVariant;
              } catch (error) {
                lastError = error as Error;
                console.error(
                  `[Agent-1] Variant ${variantId} attempt ${attempt + 1} failed:`,
                  error
                );
              }
            }

            // All retries exhausted for this variant
            send({
              type: "variant_failed",
              reason: "All retry attempts failed",
              error: lastError?.message || "Unknown error",
            });

            variantControllers[variantIndex].done = true;

            // Check if all variants are done
            if (variantControllers.every((v) => v.done)) {
              try {
                controller.close();
              } catch (e) { }
            }

            // Return an error message for this variant
            const errorMessage: Message = {
              role: "assistant",
              content: [{ type: "text", text: "Failed to generate response" }],
              agentId: self.id,
              variantId,
            };

            return errorMessage;
          })();

          completionPromises.push(completionPromise);
        });
      },
    });

    // Combine all completion promises
    const completions = Promise.all(completionPromises);

    return { stream, completions };
  }
}

export const agent1 = new Agent1();
