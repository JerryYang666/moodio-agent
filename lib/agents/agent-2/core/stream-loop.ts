import OpenAI from "openai";
import { MessageContentPart, DEFAULT_LLM_MODEL } from "@/lib/llm/types";
import { RequestContext } from "../context";
import { OutputParser, ParsedTag } from "./output-parser";
import { ToolExecutor, ToolResult } from "../executor/tool-executor";
import { ToolRegistry } from "../tools/registry";
import {
  DEFAULT_VIDEO_MODEL_ID,
  getVideoModel,
  getModelConfigForApi,
} from "@/lib/video/models";
import { siteConfig } from "@/config/site";
import { generateImageId } from "@/lib/storage/s3";
import { InsufficientCreditsError } from "@/lib/credits";

const MAX_SUGGESTIONS_HARD_CAP = siteConfig.imageLimits.maxSuggestionsHardCap;

/** Mutable state shared across the stream parsing pipeline. */
interface StreamState {
  fullLlmResponse: string;
  thoughtSent: boolean;
  questionSent: boolean;
  suggestionIndex: number;
  shotListStartSent: boolean;
  imageTasks: Promise<void>[];
  finalContent: MessageContentPart[];
}

/**
 * Orchestrates the streaming flow: consumes the LLM stream, feeds chunks
 * to the OutputParser, dispatches tool calls via the ToolExecutor, and
 * emits events to the frontend.
 *
 * Replaces Agent 1's consumeLLMStream() method.
 */
export class StreamLoop {
  constructor(
    private outputParser: OutputParser,
    private toolExecutor: ToolExecutor,
    private registry: ToolRegistry,
  ) {}

  /**
   * Run the stream loop. Consumes the LLM stream, parses tags, executes tools,
   * and returns the final content parts for the assistant message.
   */
  async run(
    llmStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    ctx: RequestContext,
    preparedMessages: any[],
    maxSuggestions: number = MAX_SUGGESTIONS_HARD_CAP,
  ): Promise<MessageContentPart[]> {
    const state: StreamState = {
      fullLlmResponse: "",
      thoughtSent: false,
      questionSent: false,
      suggestionIndex: 0,
      shotListStartSent: false,
      imageTasks: [],
      finalContent: [],
    };

    await this.consumeStream(llmStream, state, ctx, preparedMessages, maxSuggestions);

    // Wait for all image generation tasks to complete
    await Promise.all(state.imageTasks);

    console.log("=== FINAL AI LLM RESPONSE ===");
    console.log(state.fullLlmResponse);
    console.log("=== END FINAL AI LLM RESPONSE ===");

    // If no content was produced, try to extract text from the buffer
    if (state.finalContent.length === 0) {
      const text = this.outputParser.getBuffer().replace(/<[^>]*>/g, "").trim();
      if (text) {
        ctx.send({ type: "text", content: text });
        state.finalContent.push({ type: "text", text });
      }
    }

    return state.finalContent;
  }

  private async consumeStream(
    llmStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    state: StreamState,
    ctx: RequestContext,
    preparedMessages: any[],
    maxSuggestions: number,
  ): Promise<void> {
    for await (const chunk of llmStream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      this.outputParser.feed(delta);
      state.fullLlmResponse += delta;

      // Validate the buffer after each chunk
      this.outputParser.validateBuffer();

      // Extract and process all complete tags
      const completeTags = this.outputParser.extractCompleteTags();

      for (const tag of completeTags) {
        const handled = await this.handleTag(tag, state, ctx, preparedMessages, maxSuggestions);
        if (handled === "restart") {
          // Tool call required stream restart (e.g. CHECK_TAXONOMY)
          return;
        }
      }

      // Check for shot list start event (tag opened but not yet closed)
      if (!state.shotListStartSent && this.outputParser.hasOpenTag("SHOTLIST")) {
        state.shotListStartSent = true;
        ctx.send({ type: "shot_list_start" });
        console.log("[Perf] Agent shot list generation started", `[${Date.now() - ctx.requestStartTime}ms]`);
      }
    }
  }

  /**
   * Handle a single parsed tag. Returns "restart" if the stream needs to be
   * restarted (e.g. after a waitForOutput tool call).
   */
  private async handleTag(
    tag: ParsedTag,
    state: StreamState,
    ctx: RequestContext,
    preparedMessages: any[],
    maxSuggestions: number,
  ): Promise<"handled" | "restart"> {
    const toolDef = this.registry.getByName(tag.toolName);
    if (!toolDef) return "handled";

    switch (tag.toolName) {
      case "think":
        return this.handleThink(tag, state, ctx);
      case "text":
        return this.handleText(tag, state, ctx);
      case "image_suggest":
        return this.handleImageSuggest(tag, state, ctx, maxSuggestions);
      case "video":
        return this.handleVideo(tag, state, ctx);
      case "shot_list":
        return this.handleShotList(tag, state, ctx);
      case "search":
        return this.handleSearch(tag, state, ctx);
      case "check_taxonomy":
        return await this.handleCheckTaxonomy(tag, state, ctx, preparedMessages, maxSuggestions);
      default:
        return "handled";
    }
  }

  private handleThink(tag: ParsedTag, state: StreamState, ctx: RequestContext): "handled" {
    if (state.thoughtSent) return "handled";

    const thoughtText = typeof tag.parsedContent === "string"
      ? tag.parsedContent
      : String(tag.parsedContent);

    ctx.send({ type: "internal_think", content: thoughtText });
    console.log("[Perf] Agent thought sent", `[${Date.now() - ctx.requestStartTime}ms]`);
    state.finalContent.push({ type: "internal_think", text: thoughtText });
    state.thoughtSent = true;
    return "handled";
  }

  private handleText(tag: ParsedTag, state: StreamState, ctx: RequestContext): "handled" {
    if (state.questionSent) return "handled";

    const questionText = typeof tag.parsedContent === "string"
      ? tag.parsedContent
      : String(tag.parsedContent);

    ctx.send({ type: "text", content: questionText });
    console.log("[Perf] Agent question sent", `[${Date.now() - ctx.requestStartTime}ms]`);
    state.finalContent.push({ type: "text", text: questionText });
    state.questionSent = true;
    return "handled";
  }

  private handleImageSuggest(
    tag: ParsedTag,
    state: StreamState,
    ctx: RequestContext,
    maxSuggestions: number,
  ): "handled" {
    try {
      const suggestion = tag.parsedContent;

      if (state.suggestionIndex < maxSuggestions) {
        const currentIndex = state.suggestionIndex;
        state.suggestionIndex++;
        const trackingImageId = generateImageId();

        // Create a placeholder immediately
        const placeholder: MessageContentPart = {
          type: "agent_image",
          imageId: trackingImageId,
          title: "Loading...",
          aspectRatio: suggestion.aspectRatio,
          prompt: suggestion.prompt,
          status: "loading",
        };
        ctx.send({ type: "part", part: placeholder });
        state.finalContent.push(placeholder);

        console.log(
          "[Perf] Agent image generation start",
          `[${Date.now() - ctx.requestStartTime}ms]`,
          `imageId=${trackingImageId}`
        );

        // Fire-and-forget image generation task
        const task = (async () => {
          try {
            // Construct a parsedTag with the tracking ID for the handler
            const result = await this.toolExecutor.execute(
              { ...tag, parsedContent: { ...suggestion, _trackingImageId: trackingImageId } },
              ctx,
            );

            if (result.contentParts?.[0]) {
              const part = result.contentParts[0];
              const idx = state.finalContent.findIndex(
                (p) => p.type === "agent_image" && (p as any).imageId === trackingImageId
              );
              if (idx !== -1) state.finalContent[idx] = part;
            }
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
              (p) => p.type === "agent_image" && (p as any).imageId === trackingImageId
            );
            if (idx !== -1) state.finalContent[idx] = errorPart;
          }
        })();

        state.imageTasks.push(task);
      } else {
        console.log(
          `[Agent-2] Skipping suggestion beyond limit of ${maxSuggestions}. Title: ${suggestion.title}`
        );
      }
    } catch (e) {
      console.error("Failed to parse suggestion JSON", e);
      throw new Error(`JSON parsing failed: ${e}`);
    }

    return "handled";
  }

  private handleVideo(tag: ParsedTag, state: StreamState, ctx: RequestContext): "handled" {
    try {
      const videoConfig = tag.parsedContent;
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
        console.log("[Perf] Agent video config sent", `model=${model.name}`, `[${Date.now() - ctx.requestStartTime}ms]`);
      }
    } catch (e) {
      console.error("Failed to parse video config JSON", e);
    }
    return "handled";
  }

  private handleShotList(tag: ParsedTag, state: StreamState, ctx: RequestContext): "handled" {
    try {
      const shotListData = tag.parsedContent;
      const shotListPart: MessageContentPart = {
        type: "agent_shot_list",
        title: shotListData.title || "Shot List",
        columns: Array.isArray(shotListData.columns) ? shotListData.columns : [],
        rows: Array.isArray(shotListData.rows) ? shotListData.rows : [],
        status: "complete",
      };

      ctx.send({ type: "part", part: shotListPart });
      state.finalContent.push(shotListPart);
      console.log("[Perf] Agent shot list sent", `rows=${shotListPart.rows.length}`, `[${Date.now() - ctx.requestStartTime}ms]`);
    } catch (e) {
      console.error("Failed to parse shot list JSON", e);
    }
    return "handled";
  }

  private handleSearch(tag: ParsedTag, state: StreamState, ctx: RequestContext): "handled" {
    try {
      const searchData = tag.parsedContent;
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
        `[${Date.now() - ctx.requestStartTime}ms]`
      );
    } catch (e) {
      console.error("Failed to parse search JSON", e);
    }
    return "handled";
  }

  /**
   * Handle CHECK_TAXONOMY tool call.
   * This is a waitForOutput tool: we pause the stream, execute the handler,
   * inject the result, and start a new LLM stream.
   */
  private async handleCheckTaxonomy(
    tag: ParsedTag,
    state: StreamState,
    ctx: RequestContext,
    preparedMessages: any[],
    maxSuggestions: number,
  ): Promise<"handled" | "restart"> {
    // Add loading part to finalContent
    state.finalContent.push({ type: "tool_call", tool: "check_taxonomy", status: "loading" });

    // Get the partial response before the tool call
    const partialResponse = state.fullLlmResponse.substring(
      0,
      state.fullLlmResponse.indexOf("<TOOL_CALL>")
    );

    // Execute the handler
    const result = await this.toolExecutor.execute(tag, ctx);

    // Update the loading part to complete or error
    const toolCallIdx = state.finalContent.findIndex(
      (p) => p.type === "tool_call" && (p as any).status === "loading"
    );
    if (toolCallIdx !== -1) {
      state.finalContent[toolCallIdx] = {
        type: "tool_call",
        tool: "check_taxonomy",
        status: result.success ? "complete" : "error",
      };
    }

    if (!result.success) {
      console.error("[Agent-2] CHECK_TAXONOMY failed:", result.error);
      return "handled";
    }

    // Build continuation messages with the taxonomy data
    const continuationMessages = [
      ...preparedMessages,
      { role: "assistant", content: partialResponse.trim() },
      {
        role: "user",
        content: `[System: Tool call result for CHECK_TAXONOMY]\n\nHere is the taxonomy tree. Each selectable item has an [id:NUMBER] prefix. Use these IDs in your <SEARCH> filters and taxonomy: links.\n\n${result.data.serializedTaxonomy}`,
      },
    ];

    // Start a new LLM stream
    const continuationStream = await new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    }).chat.completions.create({
      model: DEFAULT_LLM_MODEL,
      messages: continuationMessages as any,
      stream: true,
    });

    console.log("[Perf] Agent continuation LLM stream started after tool call", `[${Date.now() - ctx.requestStartTime}ms]`);

    // Reset parser state for the continuation
    this.outputParser.setBuffer("");
    state.fullLlmResponse = "";
    state.thoughtSent = true; // Don't re-send thought in continuation
    state.questionSent = false;
    state.suggestionIndex = 0;
    state.shotListStartSent = false;

    // Recursively consume the continuation stream
    await this.consumeStream(continuationStream, state, ctx, continuationMessages, maxSuggestions);
    return "restart";
  }
}
