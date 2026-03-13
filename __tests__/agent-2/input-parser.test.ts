import { describe, it, expect, vi } from "vitest";
import { InputParser } from "@/lib/agents/agent-2/core/input-parser";
import { createRequestContext } from "@/lib/agents/agent-2/context";
import { Message } from "@/lib/llm/types";

// Mock the s3 module
vi.mock("@/lib/storage/s3", () => ({
  getSignedImageUrl: (id: string) => `https://cdn.example.com/${id}?signed=1`,
}));

function makeCtx(overrides: any = {}) {
  return createRequestContext({
    userId: "user-1",
    isAdmin: false,
    send: vi.fn(),
    ...overrides,
  });
}

describe("InputParser", () => {
  const parser = new InputParser();

  describe("parseHistory", () => {
    it("converts agent_image parts to text summaries", () => {
      const history: Message[] = [
        {
          role: "assistant",
          content: [
            {
              type: "agent_image",
              imageId: "img-1",
              title: "Sunset",
              aspectRatio: "16:9",
              prompt: "A sunset",
              status: "generated",
            },
          ],
        },
      ];

      const result = parser.parseHistory(history, makeCtx());
      expect(result[0].content[0].type).toBe("text");
      expect(result[0].content[0].text).toContain("img-1");
      expect(result[0].content[0].text).toContain("Sunset");
    });

    it("converts agent_video parts to text summaries", () => {
      const history: Message[] = [
        {
          role: "assistant",
          content: [
            {
              type: "agent_video",
              config: {
                modelId: "m1",
                modelName: "TestModel",
                prompt: "fly",
                params: {},
              },
              status: "pending",
            },
          ],
        },
      ];

      const result = parser.parseHistory(history, makeCtx());
      expect(result[0].content[0].text).toContain("TestModel");
      expect(result[0].content[0].text).toContain("fly");
    });

    it("converts agent_shot_list parts to text summaries", () => {
      const history: Message[] = [
        {
          role: "assistant",
          content: [
            {
              type: "agent_shot_list",
              title: "My List",
              columns: ["Shot #", "Description"],
              rows: [
                { id: "row-1", cells: [{ value: "1" }, { value: "Open" }] },
              ],
              status: "complete",
            },
          ],
        },
      ];

      const result = parser.parseHistory(history, makeCtx());
      expect(result[0].content[0].text).toContain("My List");
      expect(result[0].content[0].text).toContain("Shot # | Description");
    });

    it("converts agent_search parts to text summaries", () => {
      const history: Message[] = [
        {
          role: "assistant",
          content: [
            {
              type: "agent_search",
              query: { textSearch: "dolly", filterIds: [42] },
              status: "pending",
            },
          ],
        },
      ];

      const result = parser.parseHistory(history, makeCtx());
      expect(result[0].content[0].text).toContain("dolly");
      expect(result[0].content[0].text).toContain("42");
    });

    it("converts tool_call parts to text summaries", () => {
      const history: Message[] = [
        {
          role: "assistant",
          content: [
            { type: "tool_call", tool: "check_taxonomy", status: "complete" },
          ],
        },
      ];

      const result = parser.parseHistory(history, makeCtx());
      expect(result[0].content[0].text).toContain("check_taxonomy");
    });

    it("keeps only the latest internal_think part", () => {
      const history: Message[] = [
        {
          role: "assistant",
          content: [{ type: "internal_think", text: "old thought" }],
        },
        {
          role: "assistant",
          content: [{ type: "internal_think", text: "new thought" }],
        },
      ];

      const result = parser.parseHistory(history, makeCtx());
      // First think should be filtered out
      expect(result[0].content).toHaveLength(0);
      // Second think should be kept as text
      expect(result[1].content[0].text).toContain("new thought");
    });

    it("converts image parts in history to text annotations", () => {
      const history: Message[] = [
        {
          role: "user",
          content: [
            { type: "image", imageId: "img-1", title: "Photo" },
          ],
        },
      ];

      const result = parser.parseHistory(history, makeCtx());
      expect(result[0].content[0].text).toContain("img-1");
      expect(result[0].content[0].text).toContain("Photo");
    });

    it("passes through text parts unchanged", () => {
      const history: Message[] = [
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      ];

      const result = parser.parseHistory(history, makeCtx());
      expect(result[0].content[0]).toEqual({ type: "text", text: "hello" });
    });
  });

  describe("parseUserMessage", () => {
    it("converts string content to text part", () => {
      const msg: Message = { role: "user", content: "hello" };
      const result = parser.parseUserMessage(msg, makeCtx());
      expect(result.content).toEqual([{ type: "text", text: "hello" }]);
    });

    it("converts image parts to image_url + text annotation", () => {
      const msg: Message = {
        role: "user",
        content: [{ type: "image", imageId: "img-1", title: "Photo" }],
      };
      const result = parser.parseUserMessage(msg, makeCtx());
      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("img-1");
      expect(result.content[1].type).toBe("image_url");
      expect(result.content[1].image_url.url).toContain("img-1");
    });

    it("appends reference images with tags", () => {
      const msg: Message = { role: "user", content: "test" };
      const ctx = makeCtx({
        referenceImages: [
          { imageId: "ref-1", tag: "style", title: "Art Deco" },
        ],
      });
      const result = parser.parseUserMessage(msg, ctx);
      // text + ref text + ref image_url
      expect(result.content).toHaveLength(3);
      expect(result.content[1].text).toContain("ref-1");
      expect(result.content[1].text).toContain("style");
      expect(result.content[2].type).toBe("image_url");
    });

    it("appends reference image with 'none' tag as 'general reference'", () => {
      const msg: Message = { role: "user", content: "test" };
      const ctx = makeCtx({
        referenceImages: [{ imageId: "ref-1", tag: "none" }],
      });
      const result = parser.parseUserMessage(msg, ctx);
      expect(result.content[1].text).toContain("general reference");
    });

    it("appends precision editing prompt when applicable", () => {
      const msg: Message = { role: "user", content: "test" };
      const ctx = makeCtx({
        precisionEditing: true,
        imageIds: ["img-1"],
      });
      const result = parser.parseUserMessage(msg, ctx);
      const lastPart = result.content[result.content.length - 1];
      expect(lastPart.text).toContain("Precision Editing on");
    });

    it("does not append precision editing when no images", () => {
      const msg: Message = { role: "user", content: "test" };
      const ctx = makeCtx({ precisionEditing: true, imageIds: [] });
      const result = parser.parseUserMessage(msg, ctx);
      expect(result.content).toHaveLength(1);
    });

    it("does not append image quantity instruction (handled by system prompt)", () => {
      const msg: Message = { role: "user", content: "test" };
      const ctx = makeCtx({ maxImageQuantity: 2 });
      const result = parser.parseUserMessage(msg, ctx);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe("test");
    });
  });
});
