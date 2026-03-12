import { MessageContentPart } from "@/lib/llm/types";
import { RequestContext, StreamEvent } from "../context";

/**
 * Self-contained tool definition. Each tool declares its XML tag,
 * prompt instructions, execution mode, and how to handle its output.
 *
 * The StreamLoop is completely generic — it uses only these fields to
 * decide how to handle each tag. To add a new tool, create a file in
 * tools/, define a ToolDefinition, and register it in the Agent2
 * constructor. See lib/agents/agent-2/README.md for details.
 */
export interface ToolDefinition {
  /** Unique tool name, e.g. "image_suggest" */
  name: string;
  /** XML tag used in LLM output, e.g. "JSON" */
  tag: string;
  /** Short description of what this tool does (shown in system prompt) */
  description: string;
  /** Instruction text inserted into the system prompt */
  instruction: string;
  /** Example usages inserted into the system prompt */
  examples: string[];

  // -- Execution mode --

  /**
   * If true, the stream pauses until the tool handler returns a result
   * that is injected back into the conversation (triggers a new LLM call).
   * If false, the tool fires and the stream continues.
   */
  waitForOutput: boolean;
  /**
   * If true, the handler runs in the background (fire-and-forget).
   * The stream loop tracks the async task and awaits all at the end.
   * Used for tools that need async work (e.g. image generation) but
   * shouldn't block the stream. Requires a registered ToolHandler.
   */
  fireAndForget?: boolean;

  // -- Prompt injection --

  /**
   * Optional function that injects dynamic runtime data into the prompt
   * (e.g. video model list, supported aspect ratios).
   */
  dynamicPromptData?: () => string;

  // -- Parsing --

  /**
   * Optional parser function that converts raw tag content into structured data.
   * Falls back to JSON.parse if not provided.
   */
  parseContent?: (raw: string) => any;

  // -- Output handling (used by the generic StreamLoop) --

  /**
   * Create a MessageContentPart from parsed content.
   * Used by the stream loop to build the part for finalContent and
   * to emit the SSE event to the frontend.
   *
   * If not provided, the stream loop will NOT emit any event or push
   * anything to finalContent (the handler is responsible).
   */
  createPart?: (parsed: any, ctx: RequestContext) => MessageContentPart | null;
  /**
   * Create the SSE event to send to the frontend.
   * If not provided, defaults to:
   *   - For "text"/"internal_think" types: { type: partType, content: partText }
   *   - For everything else: { type: "part", part }
   */
  createEvent?: (part: MessageContentPart, ctx: RequestContext) => StreamEvent | null;
  /**
   * Optional callback fired when the opening tag is detected in the buffer
   * (before the closing tag arrives). Useful for streaming progress events
   * like "shot_list_start".
   */
  onOpenTag?: (ctx: RequestContext) => void;

  // -- Limits --

  /**
   * Maximum number of times this tag can be processed per request.
   * Occurrences beyond this limit are silently skipped.
   * Undefined = unlimited.
   */
  maxOccurrences?: number;

  // -- waitForOutput tools --

  /**
   * For waitForOutput tools: build the user message to inject the tool
   * result back into the conversation for the continuation LLM call.
   * Receives the ToolResult.data from the handler.
   */
  buildContinuationMessage?: (resultData: any) => string;
}
