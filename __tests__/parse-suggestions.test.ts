import { describe, it, expect } from "vitest";
import {
  parseSuggestions,
  createParseState,
  ParseEvent,
} from "@/lib/agents/parse-agent-output";

describe("parseSuggestions (JSON/image schema)", () => {
  const makeSuggestion = (title: string, ar: string, prompt: string) =>
    `<JSON>${JSON.stringify({ title, aspectRatio: ar, prompt })}</JSON>`;

  it("parses a single image suggestion", () => {
    const state = createParseState(makeSuggestion("Sunset", "16:9", "A golden sunset"));
    const events: ParseEvent[] = [];
    const suggestions = parseSuggestions(state, events);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({ title: "Sunset", aspectRatio: "16:9", prompt: "A golden sunset" });
  });

  it("emits a loading placeholder event", () => {
    const state = createParseState(makeSuggestion("Sunset", "16:9", "sunset"));
    const events: ParseEvent[] = [];
    parseSuggestions(state, events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("part");
    expect(events[0].part.type).toBe("agent_image");
    expect(events[0].part.status).toBe("loading");
  });

  it("parses multiple suggestions in sequence", () => {
    const buf = makeSuggestion("A", "1:1", "p1") + makeSuggestion("B", "3:2", "p2") + makeSuggestion("C", "9:16", "p3");
    const state = createParseState(buf);
    const events: ParseEvent[] = [];
    const suggestions = parseSuggestions(state, events);
    expect(suggestions).toHaveLength(3);
    expect(events).toHaveLength(3);
    expect(suggestions.map((s) => s.title)).toEqual(["A", "B", "C"]);
  });

  it("respects the 6-suggestion limit", () => {
    let buf = "";
    for (let i = 0; i < 10; i++) buf += makeSuggestion(`S${i}`, "1:1", `p${i}`);
    const state = createParseState(buf);
    const events: ParseEvent[] = [];
    const suggestions = parseSuggestions(state, events);
    expect(suggestions).toHaveLength(10);
    expect(events).toHaveLength(6); // only 6 placeholder events (maxSuggestionsHardCap)
    expect(state.suggestionIndex).toBe(6);
  });

  it("handles suggestion with all supported aspect ratios", () => {
    const ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16"];
    let buf = "";
    for (const ar of ratios) buf += makeSuggestion("T", ar, "p");
    const state = createParseState(buf);
    const events: ParseEvent[] = [];
    const suggestions = parseSuggestions(state, events);
    expect(suggestions).toHaveLength(6);
    expect(suggestions.map((s) => s.aspectRatio)).toEqual(ratios);
  });

  it("throws on invalid JSON inside JSON tags", () => {
    const state = createParseState("<JSON>not valid json</JSON>");
    const events: ParseEvent[] = [];
    expect(() => parseSuggestions(state, events)).toThrow();
  });

  it("handles suggestion with long prompt text", () => {
    const longPrompt = "A ".repeat(500) + "beautiful landscape";
    const state = createParseState(makeSuggestion("Long", "16:9", longPrompt));
    const events: ParseEvent[] = [];
    const suggestions = parseSuggestions(state, events);
    expect(suggestions[0].prompt).toBe(longPrompt);
  });

  it("handles suggestion with special characters in title and prompt", () => {
    const state = createParseState(
      makeSuggestion("Test & \"Quotes\"", "1:1", "A cat's dream (night)")
    );
    const events: ParseEvent[] = [];
    const suggestions = parseSuggestions(state, events);
    expect(suggestions[0].title).toBe("Test & \"Quotes\"");
    expect(suggestions[0].prompt).toBe("A cat's dream (night)");
  });

  it("assigns sequential imageIds to placeholders", () => {
    const buf = makeSuggestion("A", "1:1", "p1") + makeSuggestion("B", "1:1", "p2");
    const state = createParseState(buf);
    const events: ParseEvent[] = [];
    parseSuggestions(state, events);
    expect(events[0].part.imageId).toBe("test-image-0");
    expect(events[1].part.imageId).toBe("test-image-1");
  });

  it("does nothing when JSON closing tag is missing", () => {
    const state = createParseState('<JSON>{"title":"x","aspectRatio":"1:1","prompt":"p"}');
    const events: ParseEvent[] = [];
    const suggestions = parseSuggestions(state, events);
    expect(suggestions).toHaveLength(0);
  });
});
