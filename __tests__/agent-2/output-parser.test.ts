import { describe, it, expect } from "vitest";
import { OutputParser } from "@/lib/agents/agent-2/core/output-parser";
import { ToolRegistry } from "@/lib/agents/agent-2/tools/registry";
import { thinkTool } from "@/lib/agents/agent-2/tools/think";
import { textTool } from "@/lib/agents/agent-2/tools/text";
import { imageSuggestTool } from "@/lib/agents/agent-2/tools/image-suggest";
import { videoSuggestTool } from "@/lib/agents/agent-2/tools/video-suggest";
import { searchTool } from "@/lib/agents/agent-2/tools/search";
import { shotListTool } from "@/lib/agents/agent-2/tools/shot-list";
import { videoTool } from "@/lib/agents/agent-2/tools/video";
import { checkTaxonomyTool } from "@/lib/agents/agent-2/tools/check-taxonomy";
import { askUserTool } from "@/lib/agents/agent-2/tools/ask-user";

function createParser(): OutputParser {
  const registry = new ToolRegistry();
  registry.register(thinkTool);
  registry.register(textTool);
  registry.register(imageSuggestTool);
  registry.register(videoSuggestTool);
  registry.register(videoTool);
  registry.register(shotListTool);
  registry.register(searchTool);
  registry.register(checkTaxonomyTool);
  registry.register(askUserTool);
  return new OutputParser(registry);
}

describe("OutputParser", () => {
  describe("feed and getBuffer", () => {
    it("accumulates chunks", () => {
      const parser = createParser();
      parser.feed("<think>");
      parser.feed("hello");
      parser.feed("</think>");
      expect(parser.getBuffer()).toBe("<think>hello</think>");
    });
  });

  describe("validateBuffer", () => {
    it("accepts valid content inside tags", () => {
      const parser = createParser();
      parser.feed("<TEXT>Hello world</TEXT>");
      expect(() => parser.validateBuffer()).not.toThrow();
    });

    it("accepts whitespace between tags", () => {
      const parser = createParser();
      parser.feed("<TEXT>Hi</TEXT>\n<IMAGE>{}</IMAGE>");
      expect(() => parser.validateBuffer()).not.toThrow();
    });

    it("throws on bare text outside tags", () => {
      const parser = createParser();
      parser.feed("hello world");
      expect(() => parser.validateBuffer()).toThrow(/text outside tags/);
    });
  });

  describe("extractCompleteTags", () => {
    it("extracts a single think tag", () => {
      const parser = createParser();
      parser.feed("<think>reasoning here</think>");
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].toolName).toBe("think");
      expect(tags[0].tag).toBe("think");
      expect(tags[0].parsedContent).toBe("reasoning here");
    });

    it("extracts a TEXT tag", () => {
      const parser = createParser();
      parser.feed("<TEXT>What setting do you prefer?</TEXT>");
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].toolName).toBe("text");
      expect(tags[0].parsedContent).toBe("What setting do you prefer?");
    });

    it("extracts an IMAGE (image_suggest) tag", () => {
      const parser = createParser();
      parser.feed('<IMAGE>{"title": "Sunset", "aspectRatio": "16:9", "prompt": "A sunset"}</IMAGE>');
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].toolName).toBe("image_suggest");
      expect(tags[0].parsedContent).toEqual({
        title: "Sunset",
        aspectRatio: "16:9",
        prompt: "A sunset",
      });
    });

    it("extracts multiple IMAGE tags", () => {
      const parser = createParser();
      parser.feed(
        '<IMAGE>{"title": "A", "aspectRatio": "1:1", "prompt": "a"}</IMAGE>' +
        '<IMAGE>{"title": "B", "aspectRatio": "1:1", "prompt": "b"}</IMAGE>'
      );
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(2);
      expect(tags[0].parsedContent.title).toBe("A");
      expect(tags[1].parsedContent.title).toBe("B");
    });

    it("does not extract incomplete tags", () => {
      const parser = createParser();
      parser.feed("<TEXT>Hello");
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(0);
      expect(parser.getBuffer()).toBe("<TEXT>Hello");
    });

    it("advances the buffer past extracted tags", () => {
      const parser = createParser();
      parser.feed("<TEXT>Hi</TEXT> remaining");
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(parser.getBuffer()).toBe(" remaining");
    });

    it("extracts a TOOL_CALL (check_taxonomy) tag", () => {
      const parser = createParser();
      parser.feed('<TOOL_CALL>{"tool":"CHECK_TAXONOMY","lang":"en"}</TOOL_CALL>');
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].toolName).toBe("check_taxonomy");
      expect(tags[0].parsedContent).toEqual({ tool: "CHECK_TAXONOMY", lang: "en" });
    });

    it("extracts a SEARCH tag", () => {
      const parser = createParser();
      parser.feed('<SEARCH>{"text": "dolly zoom", "filters": [42]}</SEARCH>');
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].toolName).toBe("search");
      expect(tags[0].parsedContent).toEqual({ text: "dolly zoom", filters: [42] });
    });

    it("extracts a SHOTLIST tag", () => {
      const parser = createParser();
      parser.feed('<SHOTLIST>{"title": "Test", "columns": ["A"], "rows": []}</SHOTLIST>');
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].toolName).toBe("shot_list");
      expect(tags[0].parsedContent).toEqual({ title: "Test", columns: ["A"], rows: [] });
    });

    it("extracts a VIDEO tag", () => {
      const parser = createParser();
      parser.feed('<VIDEO>{"modelId": "m1", "prompt": "fly"}</VIDEO>');
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].toolName).toBe("video");
      expect(tags[0].parsedContent).toEqual({ modelId: "m1", prompt: "fly" });
    });

    it("extracts a VIDEO_SUGGEST tag", () => {
      const parser = createParser();
      parser.feed('<VIDEO_SUGGEST>{"title": "Sunset Walk", "aspectRatio": "16:9", "prompt": "A sunset", "videoIdea": "Camera dollies forward"}</VIDEO_SUGGEST>');
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].toolName).toBe("video_suggest");
      expect(tags[0].tag).toBe("VIDEO_SUGGEST");
      expect(tags[0].parsedContent).toEqual({
        title: "Sunset Walk",
        aspectRatio: "16:9",
        prompt: "A sunset",
        videoIdea: "Camera dollies forward",
      });
    });

    it("extracts multiple VIDEO_SUGGEST tags", () => {
      const parser = createParser();
      parser.feed(
        '<VIDEO_SUGGEST>{"title": "A", "aspectRatio": "16:9", "prompt": "a", "videoIdea": "idea a"}</VIDEO_SUGGEST>' +
        '<VIDEO_SUGGEST>{"title": "B", "aspectRatio": "9:16", "prompt": "b", "videoIdea": "idea b"}</VIDEO_SUGGEST>'
      );
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(2);
      expect(tags[0].parsedContent.title).toBe("A");
      expect(tags[0].parsedContent.videoIdea).toBe("idea a");
      expect(tags[1].parsedContent.title).toBe("B");
      expect(tags[1].parsedContent.videoIdea).toBe("idea b");
    });

    it("extracts an ASK_USER tag with multiple questions", () => {
      const parser = createParser();
      parser.feed(
        '<ASK_USER>[{"id":"purpose","question":"What is this video for?","options":["Social media ad","Product demo"]},{"id":"duration","question":"How long?","options":["15 seconds","30 seconds"]}]</ASK_USER>'
      );
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].toolName).toBe("ask_user");
      expect(tags[0].tag).toBe("ASK_USER");
      expect(tags[0].parsedContent).toHaveLength(2);
      expect(tags[0].parsedContent[0]).toEqual({
        id: "purpose",
        question: "What is this video for?",
        options: ["Social media ad", "Product demo"],
      });
      expect(tags[0].parsedContent[1]).toEqual({
        id: "duration",
        question: "How long?",
        options: ["15 seconds", "30 seconds"],
      });
    });

    it("extracts an ASK_USER tag with a single question", () => {
      const parser = createParser();
      parser.feed(
        '<ASK_USER>[{"id":"style","question":"Which style?","options":["Cinematic","Bright","Minimalist"]}]</ASK_USER>'
      );
      const tags = parser.extractCompleteTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].parsedContent).toHaveLength(1);
      expect(tags[0].parsedContent[0].id).toBe("style");
      expect(tags[0].parsedContent[0].options).toHaveLength(3);
    });
  });

  describe("hasOpenTag", () => {
    it("returns true if opening tag is present", () => {
      const parser = createParser();
      parser.feed("<SHOTLIST>partial content");
      expect(parser.hasOpenTag("SHOTLIST")).toBe(true);
    });

    it("returns false if tag is not present", () => {
      const parser = createParser();
      parser.feed("<TEXT>hello</TEXT>");
      expect(parser.hasOpenTag("SHOTLIST")).toBe(false);
    });
  });

  describe("setBuffer", () => {
    it("replaces the buffer", () => {
      const parser = createParser();
      parser.feed("old content");
      parser.setBuffer("new content");
      expect(parser.getBuffer()).toBe("new content");
    });
  });
});
