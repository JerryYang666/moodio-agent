import { Agent, AgentResponse, ParallelAgentResponse } from "../types";
import { Message, MessageContentPart, DEFAULT_LLM_MODEL } from "@/lib/llm/types";
import { ImageSize } from "@/lib/image/types";
import OpenAI from "openai";
import { downloadImage } from "@/lib/storage/s3";
import { siteConfig } from "@/config/site";

import {
  RequestContext,
  ReferenceImageEntry,
  Expertise,
  StreamEvent,
  createRequestContext,
} from "./context";
import { ToolRegistry } from "./tools/registry";
import { SystemPromptConstructor } from "./core/system-prompt";
import { InputParser } from "./core/input-parser";
import { OutputParser } from "./core/output-parser";
import { StreamLoop } from "./core/stream-loop";
import { ToolExecutor } from "./executor/tool-executor";
import { CheckTaxonomyHandler } from "./executor/handlers/check-taxonomy";
import { ImageGenerateHandler } from "./executor/handlers/image-generate";
import { VideoUnderstandHandler } from "./executor/handlers/video-understand";

// Tool definitions
import { thinkTool } from "./tools/think";
import { textTool } from "./tools/text";
import { imageSuggestTool } from "./tools/image-suggest";
import { videoSuggestTool } from "./tools/video-suggest";
import { videoTool } from "./tools/video";
import { shotListTool } from "./tools/shot-list";
import { searchTool } from "./tools/search";
import { checkTaxonomyTool } from "./tools/check-taxonomy";
import { videoUnderstandTool } from "./tools/video-understand";
import { imageGenerateSyncTool } from "./tools/image-generate-sync";
import { suggestionsTool } from "./tools/suggestions";

const MAX_RETRY = 2;
const MAX_SUGGESTIONS_HARD_CAP = siteConfig.imageLimits.maxSuggestionsHardCap;

export class Agent2 implements Agent {
  id = "agent-2";
  name = "Creative Assistant (Agent 2)";

  private registry: ToolRegistry;
  private promptConstructor: SystemPromptConstructor;
  private inputParser: InputParser;

  constructor() {
    // Build the tool registry
    this.registry = new ToolRegistry();
    this.registry.register(thinkTool);
    this.registry.register(textTool);
    this.registry.register(imageSuggestTool);
    this.registry.register(videoSuggestTool);
    this.registry.register(videoTool);
    this.registry.register(shotListTool);
    this.registry.register(searchTool);
    this.registry.register(checkTaxonomyTool);
    this.registry.register(videoUnderstandTool);
    this.registry.register(imageGenerateSyncTool);
    this.registry.register(suggestionsTool);

    this.promptConstructor = new SystemPromptConstructor(this.registry);
    this.inputParser = new InputParser();
  }

  /**
   * Create a ToolExecutor with all handlers registered.
   * Created per-request to avoid shared state.
   */
  private createToolExecutor(): ToolExecutor {
    const executor = new ToolExecutor(this.registry);
    executor.registerHandler("check_taxonomy", new CheckTaxonomyHandler());
    executor.registerHandler("image_suggest", new ImageGenerateHandler());
    executor.registerHandler("video_suggest", new ImageGenerateHandler());
    executor.registerHandler("video_understand", new VideoUnderstandHandler());
    executor.registerHandler("image_generate_sync", new ImageGenerateHandler());
    return executor;
  }

  async processRequest(
    history: Message[],
    userMessage: Message,
    userId: string,
    isAdmin: boolean,
    requestStartTime?: number,
    precisionEditing?: boolean,
    imageIds?: string[],
    systemPromptOverride?: string,
    aspectRatioOverride?: string,
    imageSizeOverride?: ImageSize,
    imageModelId?: string,
    maxImageQuantity?: number,
  ): Promise<AgentResponse> {
    const startTime = requestStartTime || Date.now();
    console.log("[Perf] Agent2 processRequest start", `[${Date.now() - startTime}ms]`);

    const encoder = new TextEncoder();
    let resolveCompletion: (value: Message) => void;
    let rejectCompletion: (error: Error) => void;
    const completion = new Promise<Message>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    const self = this;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            if (data.type?.startsWith("internal_") && !isAdmin) return;
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          } catch (e) {
            // Controller might be closed
          }
        };

        // Pre-fetch image base64 data
        const pendingImageIds = imageIds || [];
        const referenceImages: ReferenceImageEntry[] = []; // Passed from route handler in parallel mode
        const referenceImageIds = referenceImages.map((ref) => ref.imageId);
        const allImageIds = [...pendingImageIds, ...referenceImageIds];
        const imageBase64Promises = allImageIds.map((id) =>
          downloadImage(id).then((buf) => buf?.toString("base64"))
        );

        console.log(
          "[Perf] %s image base64 downloads started [%sms]",
          allImageIds.length,
          Date.now() - startTime
        );

        // Create request context
        const ctx = createRequestContext({
          userId,
          isAdmin,
          requestStartTime: startTime,
          imageIds: allImageIds,
          imageBase64Promises,
          referenceImages,
          precisionEditing,
          aspectRatioOverride,
          imageSizeOverride,
          imageModelId,
          maxImageQuantity,
          systemPromptOverride,
          send,
        });

        const effectiveMaxSuggestions = maxImageQuantity
          ? Math.min(maxImageQuantity, MAX_SUGGESTIONS_HARD_CAP)
          : MAX_SUGGESTIONS_HARD_CAP;

        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
          try {
            if (attempt > 0) {
              console.log(`[Agent-2] Retrying LLM call, attempt ${attempt + 1}/${MAX_RETRY + 1}`);
              send({ type: "invalidate", reason: "retry" });
            }

            const result = await self.callLLMAndParseCore(
              ctx,
              history,
              userMessage,
              effectiveMaxSuggestions,
              attempt > 0, // appendRetryReminder
            );

            if (attempt > 0) {
              console.log(`[Agent-2] LLM call succeeded on retry attempt ${attempt + 1}`);
            }

            resolveCompletion!(result);
            controller.close();
            return;
          } catch (error) {
            lastError = error as Error;
            console.error(`[Agent-2] LLM call attempt ${attempt + 1}/${MAX_RETRY + 1} failed:`, error);
          }
        }

        // All retries exhausted
        console.error(`[Agent-2] LLM call failed after ${MAX_RETRY + 1} attempts`);
        send({
          type: "retry_exhausted",
          reason: "All retry attempts failed",
          error: lastError?.message || "Unknown error",
        });
        rejectCompletion!(lastError || new Error("LLM call and parse failed"));
        try { controller.close(); } catch (e) {}
      },
    });

    return { stream, completion };
  }

  /**
   * Process request with parallel variants.
   * Runs N parallel LLM calls and merges their streams into a single stream with variant IDs.
   */
  async processRequestParallel(
    history: Message[],
    userMessage: Message,
    userId: string,
    isAdmin: boolean,
    variantCount: number,
    requestStartTime?: number,
    precisionEditing?: boolean,
    imageIds?: string[],
    systemPromptOverride?: string,
    aspectRatioOverride?: string,
    imageSizeOverride?: ImageSize,
    imageModelId?: string,
    messageTimestamp?: number,
    referenceImages?: ReferenceImageEntry[],
    maxImageQuantity?: number,
    expertise?: Expertise,
  ): Promise<ParallelAgentResponse> {
    const startTime = requestStartTime || Date.now();
    const variantTimestamp = messageTimestamp || Date.now();
    console.log(
      "[Perf] Agent2 processRequestParallel start with %s variants, %s images, %s reference images [%sms]",
      variantCount,
      imageIds?.length || 0,
      referenceImages?.length || 0,
      Date.now() - startTime
    );

    // Pre-fetch image base64 data (shared across all variants)
    const pendingImageIds = imageIds || [];
    const refImages = referenceImages || [];
    const referenceImageIds = refImages.map((ref) => ref.imageId);
    const allImageIds = [...pendingImageIds, ...referenceImageIds];
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

    const effectiveMaxSuggestions = maxImageQuantity
      ? Math.min(maxImageQuantity, MAX_SUGGESTIONS_HARD_CAP)
      : MAX_SUGGESTIONS_HARD_CAP;

    const encoder = new TextEncoder();
    const self = this;

    // Generate unique variant IDs
    const variantIds = Array.from(
      { length: variantCount },
      (_, i) => `variant-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    const completionPromises: Promise<Message>[] = [];
    const variantDone: boolean[] = variantIds.map(() => false);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Send the message timestamp first so frontend can sync
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "message_timestamp", timestamp: variantTimestamp }) + "\n")
        );

        variantIds.forEach((variantId, variantIndex) => {
          const completionPromise = (async () => {
            const send = (data: any) => {
              try {
                if (data.type?.startsWith("internal_") && !isAdmin) return;
                const eventWithVariant = { ...data, variantId };
                controller.enqueue(encoder.encode(JSON.stringify(eventWithVariant) + "\n"));
              } catch (e) {
                // Controller might be closed
              }
            };

            // Create per-variant request context
            const ctx = createRequestContext({
              userId,
              isAdmin,
              requestStartTime: startTime,
              imageIds: allImageIds,
              imageBase64Promises,
              referenceImages: refImages,
              precisionEditing,
              aspectRatioOverride,
              imageSizeOverride,
              imageModelId,
              maxImageQuantity,
              systemPromptOverride,
              expertise,
              send,
            });

            let lastError: Error | undefined;

            for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
              try {
                if (attempt > 0) {
                  console.log(`[Agent-2] Retrying LLM call for variant ${variantId}, attempt ${attempt + 1}/${MAX_RETRY + 1}`);
                  send({ type: "invalidate", reason: "retry" });
                }

                const result = await self.callLLMAndParseCore(
                  ctx,
                  history,
                  userMessage,
                  effectiveMaxSuggestions,
                  attempt > 0,
                );

                const messageWithVariant: Message = {
                  ...result,
                  variantId,
                  createdAt: variantTimestamp,
                };

                variantDone[variantIndex] = true;
                if (variantDone.every((d) => d)) {
                  try { controller.close(); } catch (e) {}
                }

                return messageWithVariant;
              } catch (error) {
                lastError = error as Error;
                console.error(`[Agent-2] Variant ${variantId} attempt ${attempt + 1} failed:`, error);
              }
            }

            // All retries exhausted for this variant
            send({
              type: "variant_failed",
              reason: "All retry attempts failed",
              error: lastError?.message || "Unknown error",
            });

            variantDone[variantIndex] = true;
            if (variantDone.every((d) => d)) {
              try { controller.close(); } catch (e) {}
            }

            return {
              role: "assistant" as const,
              content: [{ type: "text" as const, text: "Failed to generate response" }],
              agentId: self.id,
              variantId,
            };
          })();

          completionPromises.push(completionPromise);
        });
      },
    });

    const completions = Promise.all(completionPromises);
    return { stream, completions };
  }

  /**
   * Returns the fully-built default system prompt (no override) from the tool registry.
   * Used by the admin test kit to populate the "Reset to Default" textarea.
   */
  getDefaultSystemPrompt(): string {
    return this.promptConstructor.build();
  }

  /**
   * Core LLM call + parse flow.
   * Builds system prompt, parses input, calls LLM, runs stream loop.
   */
  private async callLLMAndParseCore(
    ctx: RequestContext,
    history: Message[],
    userMessage: Message,
    maxSuggestions: number,
    appendRetryReminder: boolean = false,
  ): Promise<Message> {
    // 1. Build system prompt
    const systemPrompt = this.promptConstructor.build({
      systemPromptOverride: ctx.systemPromptOverride,
      maxImageQuantity: ctx.maxImageQuantity,
      expertise: ctx.expertise,
    });

    // 2. Parse input
    const historyMessages = this.inputParser.parseHistory(history, ctx);
    const userMsg = this.inputParser.parseUserMessage(userMessage, ctx);

    // Append retry reminder if this is a retry attempt
    if (appendRetryReminder) {
      if (Array.isArray(userMsg.content)) {
        userMsg.content.push({
          type: "text",
          text: "\n\nPlease remember to use XML-style tags for all outputs as specified in the system prompt (e.g. <TEXT>, <IMAGE>).",
        });
      } else if (typeof userMsg.content === "string") {
        userMsg.content +=
          "\n\nPlease remember to use XML-style tags for all outputs as specified in the system prompt (e.g. <TEXT>, <IMAGE>).";
      }
    }

    const preparedMessages = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      userMsg,
    ];

    console.log("[Perf] Agent2 messages prepared", `[${Date.now() - ctx.requestStartTime}ms]`);
    console.log("prepared.messages", JSON.stringify(preparedMessages, null, 2));

    // 3. Call LLM
    const llmStream = await new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    }).chat.completions.create({
      model: DEFAULT_LLM_MODEL,
      messages: preparedMessages as any,
      stream: true,
    });

    console.log("[Perf] Agent2 LLM stream started", `[${Date.now() - ctx.requestStartTime}ms]`);

    // 4. Run stream loop
    const toolExecutor = this.createToolExecutor();
    const outputParser = new OutputParser(this.registry);
    const streamLoop = new StreamLoop(outputParser, toolExecutor, this.registry);

    const finalContent = await streamLoop.run(
      llmStream,
      ctx,
      preparedMessages,
      maxSuggestions,
    );

    return {
      role: "assistant",
      content: finalContent,
      agentId: this.id,
    };
  }
}

export const agent2 = new Agent2();
