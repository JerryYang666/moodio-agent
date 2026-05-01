import { describe, it, expect, vi } from "vitest";
import { ToolExecutor, ToolHandler, ToolResult } from "@/lib/agents/agent-2/executor/tool-executor";
import { ToolRegistry } from "@/lib/agents/agent-2/tools/registry";
import { ToolDefinition } from "@/lib/agents/agent-2/tools/types";
import { ParsedTag } from "@/lib/agents/agent-2/core/output-parser";
import { createRequestContext, RequestContext } from "@/lib/agents/agent-2/context";
import { createImageInputPreparer } from "@/lib/image/prepare-inputs";

const makeTool = (name: string, tag: string): ToolDefinition => ({
  name,
  tag,
  description: `Test tool ${name}`,
  instruction: `Use ${tag} tags`,
  examples: [],
  waitForOutput: false,
});

function makeCtx(): RequestContext {
  return createRequestContext({
    userId: "user-1",
    isAdmin: false,
    imageInputPreparer: createImageInputPreparer(undefined),
    send: vi.fn(),
  });
}

describe("ToolExecutor", () => {
  it("returns success for tools without handlers (passive tools)", async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("text", "TEXT"));
    const executor = new ToolExecutor(registry);

    const tag: ParsedTag = {
      toolName: "text",
      tag: "TEXT",
      rawContent: "hello",
      parsedContent: "hello",
    };

    const result = await executor.execute(tag, makeCtx());
    expect(result.success).toBe(true);
  });

  it("dispatches to registered handler", async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("my_tool", "MY"));
    const executor = new ToolExecutor(registry);

    const handler: ToolHandler = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { result: "done" },
      }),
    };
    executor.registerHandler("my_tool", handler);

    const tag: ParsedTag = {
      toolName: "my_tool",
      tag: "MY",
      rawContent: "{}",
      parsedContent: {},
    };

    const ctx = makeCtx();
    const result = await executor.execute(tag, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ result: "done" });
    expect(handler.execute).toHaveBeenCalledWith(tag, ctx);
  });

  it("returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    const tag: ParsedTag = {
      toolName: "nonexistent",
      tag: "NONE",
      rawContent: "",
      parsedContent: null,
    };

    const result = await executor.execute(tag, makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  it("catches handler errors and returns error result", async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("failing", "FAIL"));
    const executor = new ToolExecutor(registry);

    const handler: ToolHandler = {
      execute: vi.fn().mockRejectedValue(new Error("Handler blew up")),
    };
    executor.registerHandler("failing", handler);

    const tag: ParsedTag = {
      toolName: "failing",
      tag: "FAIL",
      rawContent: "",
      parsedContent: null,
    };

    const result = await executor.execute(tag, makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain("Handler blew up");
  });
});
