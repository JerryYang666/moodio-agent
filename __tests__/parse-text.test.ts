import { describe, it, expect } from "vitest";
import {
  parseText,
  createParseState,
  ParseEvent,
} from "@/lib/agents/parse-agent-output";

describe("parseText (TEXT schema)", () => {
  it("parses a simple TEXT block", () => {
    const state = createParseState("<TEXT>Hello world</TEXT>");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(events).toEqual([{ type: "text", content: "Hello world" }]);
    expect(state.finalContent).toHaveLength(1);
    expect(state.finalContent[0]).toEqual({ type: "text", text: "Hello world" });
  });

  it("trims whitespace from TEXT content", () => {
    const state = createParseState("<TEXT>  spaced  </TEXT>");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(events[0].content).toBe("spaced");
  });

  it("handles multiline TEXT content", () => {
    const state = createParseState("<TEXT>line1\nline2\nline3</TEXT>");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(events[0].content).toBe("line1\nline2\nline3");
  });

  it("only parses the first TEXT block (questionSent flag)", () => {
    const state = createParseState("<TEXT>first</TEXT><TEXT>second</TEXT>");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(events).toHaveLength(1);
    expect(events[0].content).toBe("first");
    parseText(state, events);
    expect(events).toHaveLength(1);
  });

  it("does nothing when TEXT tag is incomplete", () => {
    const state = createParseState("<TEXT>partial content");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(events).toHaveLength(0);
  });

  it("preserves buffer rest after extraction", () => {
    const state = createParseState("<TEXT>q</TEXT><JSON>{}</JSON>");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(state.buffer).toBe("<JSON>{}</JSON>");
  });

  it("handles TEXT with special characters", () => {
    const state = createParseState("<TEXT>What's your mood? (1-10) & why?</TEXT>");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(events[0].content).toBe("What's your mood? (1-10) & why?");
  });

  it("handles TEXT with unicode content", () => {
    const state = createParseState("<TEXT>Here are some ideas for you</TEXT>");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(events[0].content).toBe("Here are some ideas for you");
  });

  it("handles TEXT with markdown formatting", () => {
    const state = createParseState("<TEXT>**Bold** and *italic* text with `code`</TEXT>");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(events[0].content).toBe("**Bold** and *italic* text with `code`");
  });

  it("handles empty TEXT block", () => {
    const state = createParseState("<TEXT></TEXT>");
    const events: ParseEvent[] = [];
    parseText(state, events);
    expect(events[0].content).toBe("");
  });
});
