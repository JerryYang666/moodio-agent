import { MessageContentPart } from "@/lib/llm/types";
import { RequestContext } from "../context";
import { ToolRegistry } from "../tools/registry";
import { ParsedTag } from "../core/output-parser";

export interface ToolResult {
  success: boolean;
  /** For waitForOutput tools: data to inject back into the conversation. */
  data?: any;
  /** Error message to notify the agent. */
  error?: string;
  /** Content parts to emit to the frontend. */
  contentParts?: MessageContentPart[];
}

export interface ToolHandler {
  execute(parsedTag: ParsedTag, ctx: RequestContext): Promise<ToolResult>;
}

/**
 * Validates and dispatches tool calls to registered handlers.
 */
export class ToolExecutor {
  private handlers: Map<string, ToolHandler> = new Map();

  constructor(private registry: ToolRegistry) {}

  registerHandler(toolName: string, handler: ToolHandler): void {
    this.handlers.set(toolName, handler);
  }

  async execute(parsedTag: ParsedTag, ctx: RequestContext): Promise<ToolResult> {
    const toolDef = this.registry.getByName(parsedTag.toolName);
    if (!toolDef) {
      return {
        success: false,
        error: `Unknown tool: ${parsedTag.toolName}`,
      };
    }

    const handler = this.handlers.get(parsedTag.toolName);
    if (!handler) {
      // No handler registered — tool is "passive" (output-only, no execution needed)
      // This is the case for think, text, search, shot_list (they just emit events)
      return { success: true };
    }

    try {
      return await handler.execute(parsedTag, ctx);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Agent-2] Tool execution error for ${parsedTag.toolName}:`, error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
