import { describe, it, expect } from "vitest";
import { SystemPromptConstructor } from "@/lib/agents/agent-2/core/system-prompt";
import { ToolRegistry } from "@/lib/agents/agent-2/tools/registry";
import { thinkTool } from "@/lib/agents/agent-2/tools/think";
import { textTool } from "@/lib/agents/agent-2/tools/text";
import { imageSuggestTool } from "@/lib/agents/agent-2/tools/image-suggest";
import { videoTool } from "@/lib/agents/agent-2/tools/video";
import { shotListTool } from "@/lib/agents/agent-2/tools/shot-list";
import { searchTool } from "@/lib/agents/agent-2/tools/search";
import { checkTaxonomyTool } from "@/lib/agents/agent-2/tools/check-taxonomy";

function createConstructor(): SystemPromptConstructor {
  const registry = new ToolRegistry();
  registry.register(thinkTool);
  registry.register(textTool);
  registry.register(imageSuggestTool);
  registry.register(videoTool);
  registry.register(shotListTool);
  registry.register(searchTool);
  registry.register(checkTaxonomyTool);
  return new SystemPromptConstructor(registry);
}

describe("SystemPromptConstructor", () => {
  it("builds a prompt containing the base persona and tool sections", () => {
    const constructor = createConstructor();
    const prompt = constructor.build();

    expect(prompt).toContain("You are a creative assistant");
    // Think tool instruction is injected dynamically
    expect(prompt).toContain("belief_prompt");
    expect(prompt).toContain("user_intention");
  });

  it("includes aspect ratios from image_suggest tool instruction", () => {
    const constructor = createConstructor();
    const prompt = constructor.build();

    expect(prompt).toContain("1:1");
    expect(prompt).toContain("16:9");
  });

  it("includes max suggestions from image_suggest tool instruction", () => {
    const constructor = createConstructor();
    const prompt = constructor.build();

    // Max suggestions is now baked into the image_suggest instruction via template literal
    expect(prompt).toMatch(/The absolute maximum number of suggestions you can give is \d+/);
  });

  it("includes reference image instructions", () => {
    const constructor = createConstructor();
    const prompt = constructor.build();

    expect(prompt).toContain("Reference Images:");
    expect(prompt).toContain("subject");
    expect(prompt).toContain("style");
  });

  it("includes video creation instructions", () => {
    const constructor = createConstructor();
    const prompt = constructor.build();

    expect(prompt).toContain("<VIDEO>");
    expect(prompt).toContain("modelId");
  });

  it("includes shot list instructions", () => {
    const constructor = createConstructor();
    const prompt = constructor.build();

    expect(prompt).toContain("<SHOTLIST>");
    expect(prompt).toContain("shot list");
  });

  it("includes search/taxonomy instructions", () => {
    const constructor = createConstructor();
    const prompt = constructor.build();

    expect(prompt).toContain("CHECK_TAXONOMY");
    expect(prompt).toContain("<SEARCH>");
    expect(prompt).toContain("taxonomy tree");
  });

  it("includes image suggestion instructions", () => {
    const constructor = createConstructor();
    const prompt = constructor.build();

    expect(prompt).toContain("<IMAGE>");
    expect(prompt).toContain("aspectRatio");
    expect(prompt).toContain("prompt");
  });

  it("uses system prompt override when provided", () => {
    const constructor = createConstructor();
    const prompt = constructor.build({
      systemPromptOverride: "Custom override prompt for testing",
    });

    expect(prompt).not.toContain("You are a creative assistant");
    expect(prompt).toBe("Custom override prompt for testing");
  });
});
