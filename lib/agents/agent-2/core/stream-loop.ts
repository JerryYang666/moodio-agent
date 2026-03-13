import OpenAI from "openai";
import { MessageContentPart, DEFAULT_LLM_MODEL } from "@/lib/llm/types";
import { RequestContext } from "../context";
import { OutputParser, ParsedTag } from "./output-parser";
import { ToolExecutor } from "../executor/tool-executor";
import { ToolRegistry } from "../tools/registry";
import { ToolDefinition } from "../tools/types";
import { siteConfig } from "@/config/site";

const MAX_SUGGESTIONS_HARD_CAP = siteConfig.imageLimits.maxSuggestionsHardCap;

/** Mutable state shared across the stream parsing pipeline. */
interface StreamState {
  fullLlmResponse: string;
  /** Per-tool occurrence counts for enforcing maxOccurrences / maxSuggestions. */
  occurrences: Map<string, number>;
  /** Tracks which tools have already fired their onOpenTag callback. */
  openTagsFired: Set<string>;
  /** Background tasks from fireAndForget tools (awaited at the end). */
  asyncTasks: Promise<void>[];
  finalContent: MessageContentPart[];
}

/**
 * Orchestrates the streaming flow: consumes the LLM stream, feeds chunks
 * to the OutputParser, and dispatches to tools using only the declarative
 * fields on ToolDefinition (waitForOutput, fireAndForget, createPart, etc.).
 *
 * The StreamLoop has ZERO tool-specific code. To add a new tool, create a
 * ToolDefinition and register it — no changes here are needed.
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
      occurrences: new Map(),
      openTagsFired: new Set(),
      asyncTasks: [],
      finalContent: [],
    };

    await this.consumeStream(llmStream, state, ctx, preparedMessages, maxSuggestions);

    // If the LLM stopped mid-tag, close it and process the rescued tag
    if (this.outputParser.closeUnclosedTag()) {
      console.log("[Agent-2] Closed unclosed tag at end of stream");
      const rescued = this.outputParser.extractCompleteTags();
      for (const tag of rescued) {
        await this.handleTag(tag, state, ctx, preparedMessages, maxSuggestions);
      }
    }

    // Wait for all background tasks (e.g. image generation) to complete
    await Promise.all(state.asyncTasks);

    console.log("=== FINAL AI LLM RESPONSE ===");
    console.log(state.fullLlmResponse);
    console.log("=== END FINAL AI LLM RESPONSE ===");

    // If no content was produced, try to extract text from the buffer
    if (state.finalContent.length === 0) {
      const text = this.outputParser.getBuffer().replace(/<[^]*?>/g, "").trim();
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

      // Fire onOpenTag callbacks for tools with open (not yet closed) tags
      this.checkOpenTags(state, ctx);
    }
  }

  /**
   * Fire onOpenTag callbacks for tools that have an open tag in the buffer.
   */
  private checkOpenTags(state: StreamState, ctx: RequestContext): void {
    for (const tool of this.registry.getAllForPrompt()) {
      if (tool.onOpenTag && !state.openTagsFired.has(tool.name)) {
        if (this.outputParser.hasOpenTag(tool.tag)) {
          state.openTagsFired.add(tool.name);
          tool.onOpenTag(ctx);
        }
      }
    }
  }

  /**
   * Handle a single parsed tag generically using ToolDefinition fields.
   * Returns "restart" if the stream needs to be restarted (waitForOutput tools).
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

    // Check occurrence limits:
    // - fireAndForget tools use maxSuggestions as their runtime limit
    // - other tools use their static maxOccurrences
    const count = state.occurrences.get(tag.toolName) || 0;
    const limit = toolDef.fireAndForget ? maxSuggestions : toolDef.maxOccurrences;
    if (limit !== undefined && count >= limit) {
      console.log(`[Agent-2] Skipping ${tag.toolName} beyond limit of ${limit}`);
      return "handled";
    }
    state.occurrences.set(tag.toolName, count + 1);

    // waitForOutput tools: pause stream, execute handler, inject result, restart
    if (toolDef.waitForOutput) {
      return this.handleWaitForOutput(tag, toolDef, state, ctx, preparedMessages, maxSuggestions);
    }

    // fireAndForget tools: create placeholder, run handler in background
    if (toolDef.fireAndForget) {
      this.handleFireAndForget(tag, toolDef, state, ctx);
      return "handled";
    }

    // Passive tools: create part, emit event
    this.handlePassive(tag, toolDef, state, ctx);
    return "handled";
  }

  /**
   * Handle a passive tool: create a content part and emit an event.
   */
  private handlePassive(
    tag: ParsedTag,
    toolDef: ToolDefinition,
    state: StreamState,
    ctx: RequestContext,
  ): void {
    if (!toolDef.createPart) return;

    try {
      const part = toolDef.createPart(tag.parsedContent, ctx);
      if (!part) return;

      // Emit event — use tool's custom createEvent, or default to { type: "part", part }
      const event = toolDef.createEvent
        ? toolDef.createEvent(part, ctx)
        : { type: "part", part };
      if (event) ctx.send(event);

      state.finalContent.push(part);
      console.log(`[Perf] Agent ${tag.toolName} sent`, `[${Date.now() - ctx.requestStartTime}ms]`);
    } catch (e) {
      console.error(`Failed to process ${tag.toolName}:`, e);
    }
  }

  /**
   * Handle a fire-and-forget tool: create placeholder, run handler in background.
   * The handler is responsible for sending part_update events and returning
   * contentParts in the ToolResult for finalContent updates.
   */
  private handleFireAndForget(
    tag: ParsedTag,
    toolDef: ToolDefinition,
    state: StreamState,
    ctx: RequestContext,
  ): void {
    try {
      // Create placeholder via createPart if defined
      let placeholder: MessageContentPart | null = null;
      if (toolDef.createPart) {
        placeholder = toolDef.createPart(tag.parsedContent, ctx);
        if (placeholder) {
          const event = toolDef.createEvent
            ? toolDef.createEvent(placeholder, ctx)
            : { type: "part", part: placeholder };
          if (event) ctx.send(event);
          state.finalContent.push(placeholder);
        }
      }

      console.log(
        `[Perf] Agent ${tag.toolName} start`,
        `[${Date.now() - ctx.requestStartTime}ms]`,
        placeholder && "imageId" in placeholder ? `imageId=${(placeholder as any).imageId}` : "",
      );

      // Fire async task
      const task = (async () => {
        try {
          // Enrich parsedContent with tracking info from placeholder
          const enrichedContent = { ...tag.parsedContent };
          if (placeholder && "imageId" in placeholder) {
            enrichedContent._trackingImageId = (placeholder as any).imageId;
          }

          const result = await this.toolExecutor.execute(
            { ...tag, parsedContent: enrichedContent },
            ctx,
          );

          // Update finalContent placeholder with the actual result part
          if (result.contentParts?.[0] && placeholder) {
            const idx = state.finalContent.indexOf(placeholder);
            if (idx !== -1) state.finalContent[idx] = result.contentParts[0];
          }
        } catch (err) {
          console.error(`[Agent-2] Fire-and-forget error for ${tag.toolName}:`, err);
        }
      })();

      state.asyncTasks.push(task);
    } catch (e) {
      console.error(`Failed to start fire-and-forget ${tag.toolName}:`, e);
    }
  }

  /**
   * Handle a waitForOutput tool: execute handler, inject result into
   * conversation, and restart the LLM stream.
   */
  private async handleWaitForOutput(
    tag: ParsedTag,
    toolDef: ToolDefinition,
    state: StreamState,
    ctx: RequestContext,
    preparedMessages: any[],
    maxSuggestions: number,
  ): Promise<"handled" | "restart"> {
    // Create loading part if tool defines createPart
    let loadingPart: MessageContentPart | null = null;
    if (toolDef.createPart) {
      loadingPart = toolDef.createPart(tag.parsedContent, ctx);
      if (loadingPart) {
        const event = toolDef.createEvent
          ? toolDef.createEvent(loadingPart, ctx)
          : { type: "part", part: loadingPart };
        if (event) ctx.send(event);
        state.finalContent.push(loadingPart);
      }
    }

    // Get the partial LLM response before the tool call tag
    const tagOpen = `<${toolDef.tag}>`;
    const tagIdx = state.fullLlmResponse.indexOf(tagOpen);
    const partialResponse = tagIdx >= 0
      ? state.fullLlmResponse.substring(0, tagIdx)
      : state.fullLlmResponse;

    // Execute the handler
    const result = await this.toolExecutor.execute(tag, ctx);

    // Update loading part status
    if (loadingPart) {
      const idx = state.finalContent.indexOf(loadingPart);
      if (idx !== -1) {
        state.finalContent[idx] = {
          ...loadingPart,
          status: result.success ? "complete" : "error",
        } as MessageContentPart;
      }
    }

    if (!result.success) {
      console.error(`[Agent-2] ${tag.toolName} failed:`, result.error);
      return "handled";
    }

    // Build continuation message from handler result
    if (!toolDef.buildContinuationMessage) {
      console.warn(`[Agent-2] waitForOutput tool ${tag.toolName} has no buildContinuationMessage`);
      return "handled";
    }

    const continuationUserMessage = toolDef.buildContinuationMessage(result.data);
    const continuationMessages = [
      ...preparedMessages,
      { role: "assistant", content: partialResponse.trim() },
      { role: "user", content: continuationUserMessage },
    ];

    // Start a new LLM stream
    const continuationStream = await new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    }).chat.completions.create({
      model: DEFAULT_LLM_MODEL,
      messages: continuationMessages as any,
      stream: true,
    });

    console.log(
      `[Perf] Agent continuation LLM stream started after ${tag.toolName}`,
      `[${Date.now() - ctx.requestStartTime}ms]`,
    );

    // Reset parser state for the continuation
    this.outputParser.setBuffer("");
    state.fullLlmResponse = "";
    // Preserve think occurrence so the continuation doesn't re-send thought
    const thinkCount = state.occurrences.get("think") || 0;
    state.occurrences.clear();
    if (thinkCount > 0) state.occurrences.set("think", thinkCount);
    state.openTagsFired.clear();

    // Recursively consume the continuation stream
    await this.consumeStream(continuationStream, state, ctx, continuationMessages, maxSuggestions);
    return "restart";
  }
}
