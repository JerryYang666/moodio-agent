import { ToolDefinition } from "./types";

/**
 * Central registry that collects ToolDefinition objects and exposes them
 * to the system prompt constructor, output parser, and tool executor.
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private tagIndex: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
    this.tagIndex.set(tool.tag, tool);
  }

  getByTag(tag: string): ToolDefinition | undefined {
    return this.tagIndex.get(tag);
  }

  getByName(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** All registered XML tags (for output parser validation). */
  getAllTags(): string[] {
    return Array.from(this.tagIndex.keys());
  }

  /** All tool definitions (for system prompt construction). */
  getAllForPrompt(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
