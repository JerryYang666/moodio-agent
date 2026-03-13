import { describe, it, expect } from "vitest";
import { ToolRegistry } from "@/lib/agents/agent-2/tools/registry";
import { ToolDefinition } from "@/lib/agents/agent-2/tools/types";

const makeTool = (name: string, tag: string): ToolDefinition => ({
  name,
  tag,
  description: `Test tool ${name}`,
  instruction: `Use ${tag} tags`,
  examples: [],
  waitForOutput: false,
});

describe("ToolRegistry", () => {
  it("registers and retrieves a tool by name", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("test", "TEST");
    registry.register(tool);
    expect(registry.getByName("test")).toBe(tool);
  });

  it("retrieves a tool by tag", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("test", "TEST");
    registry.register(tool);
    expect(registry.getByTag("TEST")).toBe(tool);
  });

  it("returns undefined for unknown tool name", () => {
    const registry = new ToolRegistry();
    expect(registry.getByName("nonexistent")).toBeUndefined();
  });

  it("returns undefined for unknown tag", () => {
    const registry = new ToolRegistry();
    expect(registry.getByTag("NONEXISTENT")).toBeUndefined();
  });

  it("throws on duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("test", "TEST"));
    expect(() => registry.register(makeTool("test", "TEST2"))).toThrow(
      /already registered/
    );
  });

  it("returns all tags", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("a", "A"));
    registry.register(makeTool("b", "B"));
    registry.register(makeTool("c", "C"));
    const tags = registry.getAllTags();
    expect(tags).toContain("A");
    expect(tags).toContain("B");
    expect(tags).toContain("C");
    expect(tags).toHaveLength(3);
  });

  it("returns all tools for prompt", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("a", "A"));
    registry.register(makeTool("b", "B"));
    const tools = registry.getAllForPrompt();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain("a");
    expect(tools.map((t) => t.name)).toContain("b");
  });
});
