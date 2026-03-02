import { describe, it, expect } from "vitest";
import {
  parseSearch,
  createParseState,
  ParseEvent,
} from "@/lib/agents/parse-agent-output";

describe("parseSearch (SEARCH schema)", () => {
  const wrap = (json: object) => `<SEARCH>${JSON.stringify(json)}</SEARCH>`;

  it("parses a search with text and filters", () => {
    const state = createParseState(wrap({ text: "sunset beach", filters: [1, 2, 3] }));
    const events: ParseEvent[] = [];
    const result = parseSearch(state, events);
    expect(result).toEqual({ textSearch: "sunset beach", filterIds: [1, 2, 3] });
  });

  it("emits a part event with agent_search type", () => {
    const state = createParseState(wrap({ text: "q", filters: [] }));
    const events: ParseEvent[] = [];
    parseSearch(state, events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("part");
    expect(events[0].part.type).toBe("agent_search");
    expect(events[0].part.status).toBe("pending");
  });

  it("handles missing text field (defaults to empty string)", () => {
    const state = createParseState(wrap({ filters: [5] }));
    const events: ParseEvent[] = [];
    const result = parseSearch(state, events);
    expect(result!.textSearch).toBe("");
  });

  it("handles non-string text field (defaults to empty string)", () => {
    const state = createParseState(wrap({ text: 123, filters: [] }));
    const events: ParseEvent[] = [];
    const result = parseSearch(state, events);
    expect(result!.textSearch).toBe("");
  });

  it("handles missing filters field (defaults to empty array)", () => {
    const state = createParseState(wrap({ text: "query" }));
    const events: ParseEvent[] = [];
    const result = parseSearch(state, events);
    expect(result!.filterIds).toEqual([]);
  });

  it("handles non-array filters field (defaults to empty array)", () => {
    const state = createParseState(wrap({ text: "q", filters: "not_array" }));
    const events: ParseEvent[] = [];
    const result = parseSearch(state, events);
    expect(result!.filterIds).toEqual([]);
  });

  it("handles search with many filter IDs", () => {
    const filters = Array.from({ length: 50 }, (_, i) => i + 1);
    const state = createParseState(wrap({ text: "broad search", filters }));
    const events: ParseEvent[] = [];
    const result = parseSearch(state, events);
    expect(result!.filterIds).toHaveLength(50);
  });

  it("returns null when closing tag is missing", () => {
    const state = createParseState('<SEARCH>{"text":"q","filters":[]}');
    const events: ParseEvent[] = [];
    expect(parseSearch(state, events)).toBeNull();
  });

  it("throws on invalid JSON", () => {
    const state = createParseState("<SEARCH>bad json</SEARCH>");
    const events: ParseEvent[] = [];
    expect(() => parseSearch(state, events)).toThrow();
  });

  it("preserves buffer rest after extraction", () => {
    const state = createParseState(wrap({ text: "q", filters: [] }) + "<TEXT>hi</TEXT>");
    const events: ParseEvent[] = [];
    parseSearch(state, events);
    expect(state.buffer).toBe("<TEXT>hi</TEXT>");
  });
});
