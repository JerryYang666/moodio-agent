import { MessageContentPart } from "@/lib/llm/types";
import { RequestContext } from "../context";

/**
 * Self-contained tool definition. Each tool declares its XML tag,
 * prompt instructions, schema, and execution mode.
 */
export interface ToolDefinition {
  /** Unique tool name, e.g. "image_suggest" */
  name: string;
  /** XML tag used in LLM output, e.g. "JSON" */
  tag: string;
  /** Short description of what this tool does */
  description: string;
  /** Instruction text inserted into the system prompt */
  instruction: string;
  /** Example usages inserted into the system prompt */
  examples: string[];
  /**
   * If true, the stream pauses until the tool returns a result
   * that is injected back into the conversation.
   * If false, the tool fires and the stream continues.
   */
  waitForOutput: boolean;
  /**
   * Optional function that injects dynamic runtime data into the prompt
   * (e.g. video model list, supported aspect ratios).
   */
  dynamicPromptData?: () => string;
  /**
   * Optional parser function that converts raw tag content into structured data.
   * Falls back to JSON.parse if not provided.
   */
  parseContent?: (raw: string) => any;
  /**
   * Optional function to create a MessageContentPart from parsed content.
   * Used by the output parser to build the part for the frontend and finalContent.
   */
  createPart?: (parsed: any, ctx: RequestContext) => MessageContentPart | null;
}
