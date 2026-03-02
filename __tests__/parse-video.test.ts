import { describe, it, expect } from "vitest";
import {
  parseVideo,
  createParseState,
  ParseEvent,
} from "@/lib/agents/parse-agent-output";

describe("parseVideo (VIDEO schema)", () => {
  const wrap = (json: object) => `<VIDEO>${JSON.stringify(json)}</VIDEO>`;

  it("parses a basic video config", () => {
    const state = createParseState(wrap({ modelId: "kling-v2", prompt: "A cat walking" }));
    const events: ParseEvent[] = [];
    const config = parseVideo(state, events);
    expect(config).toBeTruthy();
    expect(config!.modelId).toBe("kling-v2");
    expect(config!.prompt).toBe("A cat walking");
  });

  it("emits a part event with agent_video type", () => {
    const state = createParseState(wrap({ modelId: "m", prompt: "p" }));
    const events: ParseEvent[] = [];
    parseVideo(state, events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("part");
    expect(events[0].part.type).toBe("agent_video");
    expect(events[0].part.status).toBe("pending");
  });

  it("sets modelId from config", () => {
    const state = createParseState(wrap({ modelId: "wan-v2", prompt: "p" }));
    const events: ParseEvent[] = [];
    parseVideo(state, events);
    expect(events[0].part.config.modelId).toBe("wan-v2");
  });

  it("handles missing modelId gracefully", () => {
    const state = createParseState(wrap({ prompt: "p" }));
    const events: ParseEvent[] = [];
    parseVideo(state, events);
    expect(events[0].part.config.modelId).toBe("unknown");
  });

  it("handles missing prompt gracefully", () => {
    const state = createParseState(wrap({ modelId: "m" }));
    const events: ParseEvent[] = [];
    parseVideo(state, events);
    expect(events[0].part.config.prompt).toBe("");
  });

  it("passes through sourceImageId when it is a string", () => {
    const state = createParseState(wrap({ modelId: "m", prompt: "p", sourceImageId: "img-123" }));
    const events: ParseEvent[] = [];
    parseVideo(state, events);
    expect(events[0].part.config.sourceImageId).toBe("img-123");
  });

  it("ignores non-string sourceImageId", () => {
    const state = createParseState(wrap({ modelId: "m", prompt: "p", sourceImageId: 42 }));
    const events: ParseEvent[] = [];
    parseVideo(state, events);
    expect(events[0].part.config.sourceImageId).toBeUndefined();
  });

  it("returns null when closing tag is missing", () => {
    const state = createParseState('<VIDEO>{"modelId":"m","prompt":"p"}');
    const events: ParseEvent[] = [];
    expect(parseVideo(state, events)).toBeNull();
    expect(events).toHaveLength(0);
  });

  it("throws on invalid JSON", () => {
    const state = createParseState("<VIDEO>not json</VIDEO>");
    const events: ParseEvent[] = [];
    expect(() => parseVideo(state, events)).toThrow();
  });

  it("preserves buffer rest after extraction", () => {
    const state = createParseState(wrap({ modelId: "m", prompt: "p" }) + "<TEXT>hi</TEXT>");
    const events: ParseEvent[] = [];
    parseVideo(state, events);
    expect(state.buffer).toBe("<TEXT>hi</TEXT>");
  });
});
