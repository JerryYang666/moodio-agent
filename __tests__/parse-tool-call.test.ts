import { describe, it, expect } from "vitest";
import {
  parseToolCall,
  createParseState,
  ParseEvent,
} from "@/lib/agents/parse-agent-output";

describe("parseToolCall (TOOL_CALL schema)", () => {
  const wrap = (json: object) => `<TOOL_CALL>${JSON.stringify(json)}</TOOL_CALL>`;

  it("parses a CHECK_TAXONOMY tool call", () => {
    const state = createParseState(wrap({ tool: "CHECK_TAXONOMY", lang: "en" }));
    const events: ParseEvent[] = [];
    const result = parseToolCall(state, events);
    expect(result).toEqual({ tool: "CHECK_TAXONOMY", lang: "en" });
  });

  it("emits a tool_call event with loading status", () => {
    const state = createParseState(wrap({ tool: "CHECK_TAXONOMY", lang: "en" }));
    const events: ParseEvent[] = [];
    parseToolCall(state, events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_call");
    expect(events[0].status).toBe("loading");
  });

  it("lowercases the tool name in the event", () => {
    const state = createParseState(wrap({ tool: "CHECK_TAXONOMY", lang: "en" }));
    const events: ParseEvent[] = [];
    parseToolCall(state, events);
    expect(events[0].tool).toBe("check_taxonomy");
  });

  it("defaults lang to 'en' when missing", () => {
    const state = createParseState(wrap({ tool: "CHECK_TAXONOMY" }));
    const events: ParseEvent[] = [];
    const result = parseToolCall(state, events);
    expect(result!.lang).toBe("en");
  });

  it("defaults lang to 'en' when not a string", () => {
    const state = createParseState(wrap({ tool: "CHECK_TAXONOMY", lang: 42 }));
    const events: ParseEvent[] = [];
    const result = parseToolCall(state, events);
    expect(result!.lang).toBe("en");
  });

  it("handles Japanese lang code", () => {
    const state = createParseState(wrap({ tool: "CHECK_TAXONOMY", lang: "ja" }));
    const events: ParseEvent[] = [];
    const result = parseToolCall(state, events);
    expect(result!.lang).toBe("ja");
  });

  it("handles Korean lang code", () => {
    const state = createParseState(wrap({ tool: "CHECK_TAXONOMY", lang: "ko" }));
    const events: ParseEvent[] = [];
    const result = parseToolCall(state, events);
    expect(result!.lang).toBe("ko");
  });

  it("returns null when closing tag is missing", () => {
    const state = createParseState('<TOOL_CALL>{"tool":"CHECK_TAXONOMY","lang":"en"}');
    const events: ParseEvent[] = [];
    expect(parseToolCall(state, events)).toBeNull();
  });

  it("throws on invalid JSON", () => {
    const state = createParseState("<TOOL_CALL>bad</TOOL_CALL>");
    const events: ParseEvent[] = [];
    expect(() => parseToolCall(state, events)).toThrow();
  });

  it("adds tool_call to finalContent", () => {
    const state = createParseState(wrap({ tool: "CHECK_TAXONOMY", lang: "en" }));
    const events: ParseEvent[] = [];
    parseToolCall(state, events);
    expect(state.finalContent).toHaveLength(1);
    expect(state.finalContent[0].type).toBe("tool_call");
  });
});
