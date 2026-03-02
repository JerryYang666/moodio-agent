/**
 * Streaming simulation tests.
 *
 * These replicate how `consumeLLMStream` works in agent-1.ts: chunks arrive
 * one at a time, the buffer accumulates, and parse functions run after each
 * chunk. This verifies that:
 *   - Valid schemas are detected incrementally as chunks complete tags
 *   - Malformed / invalid schemas are caught mid-stream
 *   - Partial tags don't trigger premature extraction
 */
import { describe, it, expect } from "vitest";
import {
  validateBufferTags,
  extractTag,
  parseThought,
  parseText,
  parseSuggestions,
  parseVideo,
  parseShotList,
  parseSearch,
  parseToolCall,
  createParseState,
  ParseEvent,
  ParseState,
} from "@/lib/agents/parse-agent-output";

/**
 * Simulate the streaming loop from consumeLLMStream.
 * Feeds chunks one at a time, validates after each, runs all parsers.
 */
function simulateStream(
  chunks: string[]
): { events: ParseEvent[]; state: ParseState } {
  const state = createParseState();
  const events: ParseEvent[] = [];

  for (const chunk of chunks) {
    state.buffer += chunk;
    state.fullLlmResponse += chunk;

    validateBufferTags(state.buffer);

    parseThought(state, events);
    parseText(state, events);
    parseSuggestions(state, events);
    parseVideo(state, events);
    parseShotList(state, events);
    parseSearch(state, events);
    parseToolCall(state, events);
  }

  return { events, state };
}

// ---------------------------------------------------------------------------
// Incremental arrival – valid schemas
// ---------------------------------------------------------------------------

describe("streaming: incremental valid schemas", () => {
  it("detects TEXT only after closing tag arrives", () => {
    const state = createParseState();
    const events: ParseEvent[] = [];

    state.buffer += "<TEXT>Hel";
    state.fullLlmResponse += "<TEXT>Hel";
    validateBufferTags(state.buffer);
    parseText(state, events);
    expect(events).toHaveLength(0);

    state.buffer += "lo world</TEXT>";
    state.fullLlmResponse += "lo world</TEXT>";
    validateBufferTags(state.buffer);
    parseText(state, events);
    expect(events).toHaveLength(1);
    expect(events[0].content).toBe("Hello world");
  });

  it("handles think tag split across many chunks", () => {
    const chunks = [
      "<thi",
      "nk>",
      "User wants ",
      "sunset ",
      "images",
      "</thi",
      "nk>",
    ];
    const { events } = simulateStream(chunks);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("internal_think");
    expect(events[0].content).toBe("User wants sunset images");
  });

  it("parses think then TEXT then JSON arriving in interleaved chunks", () => {
    const chunks = [
      "<think>reason",
      "ing</think>",
      "<TEXT>He",
      "llo</TEXT>",
      '<JSON>{"title":"A",',
      '"aspectRatio":"1:1",',
      '"prompt":"p"}</JSON>',
    ];
    const { events, state } = simulateStream(chunks);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("internal_think");
    expect(events[1].type).toBe("text");
    expect(events[2].type).toBe("part");
    expect(state.finalContent).toHaveLength(3);
  });

  it("handles two JSON suggestions arriving one chunk at a time", () => {
    const s1 = '{"title":"A","aspectRatio":"1:1","prompt":"p1"}';
    const s2 = '{"title":"B","aspectRatio":"16:9","prompt":"p2"}';
    const chunks = [
      "<TEXT>Go</TEXT>",
      "<JSON>",
      s1,
      "</JSON>",
      "<JSON>",
      s2,
      "</JSON>",
    ];
    const { events } = simulateStream(chunks);
    const parts = events.filter((e) => e.type === "part");
    expect(parts).toHaveLength(2);
  });

  it("detects VIDEO tag split mid-JSON", () => {
    const chunks = [
      "<TEXT>here</TEXT>",
      '<VIDEO>{"modelId":',
      '"kling-v2","prompt":',
      '"walk"}</VIDEO>',
    ];
    const { events } = simulateStream(chunks);
    const videoParts = events.filter(
      (e) => e.type === "part" && e.part?.type === "agent_video"
    );
    expect(videoParts).toHaveLength(1);
  });

  it("detects SHOTLIST arriving in small fragments", () => {
    const json = JSON.stringify({
      title: "List",
      columns: ["Shot"],
      rows: [{ id: "1", cells: [{ value: "Wide" }] }],
    });
    const fragments = [
      "<TEXT>plan</TEXT>",
      "<SHOT",
      "LIST>",
      json.slice(0, 20),
      json.slice(20),
      "</SHOTLIST>",
    ];
    const { events } = simulateStream(fragments);
    expect(events.some((e) => e.type === "shot_list_start")).toBe(true);
    expect(
      events.some((e) => e.type === "part" && e.part?.type === "agent_shot_list")
    ).toBe(true);
  });

  it("detects SEARCH tag arriving in two chunks", () => {
    const chunks = [
      "<TEXT>searching</TEXT>",
      '<SEARCH>{"text":"q",',
      '"filters":[1,2]}</SEARCH>',
    ];
    const { events } = simulateStream(chunks);
    const searchParts = events.filter(
      (e) => e.type === "part" && e.part?.type === "agent_search"
    );
    expect(searchParts).toHaveLength(1);
  });

  it("detects TOOL_CALL arriving in two chunks", () => {
    const chunks = [
      '<TOOL_CALL>{"tool":',
      '"CHECK_TAXONOMY","lang":"ja"}</TOOL_CALL>',
    ];
    const { events } = simulateStream(chunks);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_call");
  });

  it("handles realistic character-by-character streaming for short output", () => {
    const full = '<TEXT>Hi</TEXT><JSON>{"title":"T","aspectRatio":"1:1","prompt":"p"}</JSON>';
    const chunks = full.split("");
    const { events } = simulateStream(chunks);
    expect(events).toHaveLength(2);
  });

  it("buffer is cleaned up after each tag is consumed", () => {
    const chunks = [
      "<think>t</think>",
      "<TEXT>q</TEXT>",
      '<JSON>{"title":"A","aspectRatio":"1:1","prompt":"p"}</JSON>',
    ];
    const { state } = simulateStream(chunks);
    expect(state.buffer).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Malformed / invalid schema detection during streaming
// ---------------------------------------------------------------------------

describe("streaming: malformed schema detection", () => {
  it("throws when bare text appears between chunks", () => {
    const state = createParseState();

    state.buffer += "<TEXT>ok</TEXT>";
    state.fullLlmResponse += "<TEXT>ok</TEXT>";
    validateBufferTags(state.buffer);

    state.buffer += "INVALID";
    state.fullLlmResponse += "INVALID";
    expect(() => validateBufferTags(state.buffer)).toThrow(/text outside tags/);
  });

  it("throws when LLM emits text before first tag", () => {
    expect(() => simulateStream(["Oops", "<TEXT>hi</TEXT>"])).toThrow(
      /text outside tags/
    );
  });

  it("throws when LLM injects text between closing and next opening tag", () => {
    expect(() =>
      simulateStream([
        "<TEXT>ok</TEXT>",
        " random ",
        '<JSON>{"title":"x","aspectRatio":"1:1","prompt":"p"}</JSON>',
      ])
    ).toThrow(/text outside tags/);
  });

  it("catches bare text after a complete think block", () => {
    expect(() =>
      simulateStream(["<think>thought</think>", "bare text here"])
    ).toThrow(/text outside tags/);
  });

  it("throws on invalid JSON inside JSON tag during streaming", () => {
    const state = createParseState();
    const events: ParseEvent[] = [];

    state.buffer += "<TEXT>ok</TEXT>";
    state.fullLlmResponse += "<TEXT>ok</TEXT>";
    validateBufferTags(state.buffer);
    parseText(state, events);

    state.buffer += "<JSON>not valid json</JSON>";
    state.fullLlmResponse += "<JSON>not valid json</JSON>";
    validateBufferTags(state.buffer);
    expect(() => parseSuggestions(state, events)).toThrow();
  });

  it("throws on invalid JSON inside VIDEO tag during streaming", () => {
    const state = createParseState();
    const events: ParseEvent[] = [];

    state.buffer += "<TEXT>ok</TEXT>";
    parseText(state, events);

    state.buffer += "<VIDEO>{bad json}</VIDEO>";
    expect(() => parseVideo(state, events)).toThrow();
  });

  it("throws on invalid JSON inside SHOTLIST tag during streaming", () => {
    const state = createParseState();
    state.shotListStartSent = true;
    const events: ParseEvent[] = [];
    state.buffer += "<SHOTLIST>not json</SHOTLIST>";
    expect(() => parseShotList(state, events)).toThrow();
  });

  it("throws on invalid JSON inside SEARCH tag during streaming", () => {
    const state = createParseState();
    const events: ParseEvent[] = [];
    state.buffer += "<SEARCH>bad</SEARCH>";
    expect(() => parseSearch(state, events)).toThrow();
  });

  it("throws on invalid JSON inside TOOL_CALL tag during streaming", () => {
    const state = createParseState();
    const events: ParseEvent[] = [];
    state.buffer += "<TOOL_CALL>bad</TOOL_CALL>";
    expect(() => parseToolCall(state, events)).toThrow();
  });

  it("does not throw for partial tags that look like text (streaming edge case)", () => {
    const state = createParseState();
    state.buffer += "<TEX";
    state.fullLlmResponse += "<TEX";
    expect(() => validateBufferTags(state.buffer)).not.toThrow();

    state.buffer += "T>content</TEXT>";
    state.fullLlmResponse += "T>content</TEXT>";
    expect(() => validateBufferTags(state.buffer)).not.toThrow();
  });
});
