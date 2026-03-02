import { describe, it, expect } from "vitest";
import {
  parseThought,
  createParseState,
  ParseEvent,
} from "@/lib/agents/parse-agent-output";

describe("parseThought (think schema)", () => {
  it("parses a simple think block", () => {
    const state = createParseState("<think>I should suggest landscapes</think>");
    const events: ParseEvent[] = [];
    parseThought(state, events);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "internal_think", content: "I should suggest landscapes" });
  });

  it("trims whitespace from think content", () => {
    const state = createParseState("<think>  padded thought  </think>");
    const events: ParseEvent[] = [];
    parseThought(state, events);
    expect(events[0].content).toBe("padded thought");
  });

  it("handles multiline think content", () => {
    const thought = "Step 1: Analyze the request\nStep 2: Generate ideas\nStep 3: Create images";
    const state = createParseState(`<think>${thought}</think>`);
    const events: ParseEvent[] = [];
    parseThought(state, events);
    expect(events[0].content).toBe(thought);
  });

  it("only parses the first think block (thoughtSent flag)", () => {
    const state = createParseState("<think>first</think><think>second</think>");
    const events: ParseEvent[] = [];
    parseThought(state, events);
    expect(events).toHaveLength(1);
    expect(events[0].content).toBe("first");
    parseThought(state, events);
    expect(events).toHaveLength(1);
  });

  it("adds internal_think to finalContent", () => {
    const state = createParseState("<think>reasoning</think>");
    const events: ParseEvent[] = [];
    parseThought(state, events);
    expect(state.finalContent).toHaveLength(1);
    expect(state.finalContent[0]).toEqual({ type: "internal_think", text: "reasoning" });
  });

  it("does nothing when think tag is incomplete", () => {
    const state = createParseState("<think>still thinking...");
    const events: ParseEvent[] = [];
    parseThought(state, events);
    expect(events).toHaveLength(0);
  });

  it("preserves buffer rest after extraction", () => {
    const state = createParseState("<think>ok</think><TEXT>hi</TEXT>");
    const events: ParseEvent[] = [];
    parseThought(state, events);
    expect(state.buffer).toBe("<TEXT>hi</TEXT>");
  });

  it("handles think with long chain-of-thought", () => {
    const longThought = "The user wants " + "a detailed analysis. ".repeat(100);
    const state = createParseState(`<think>${longThought}</think>`);
    const events: ParseEvent[] = [];
    parseThought(state, events);
    expect(events[0].content).toBe(longThought.trim());
  });

  it("handles empty think block", () => {
    const state = createParseState("<think></think>");
    const events: ParseEvent[] = [];
    parseThought(state, events);
    expect(events[0].content).toBe("");
  });

  it("sets thoughtSent flag to true", () => {
    const state = createParseState("<think>ok</think>");
    const events: ParseEvent[] = [];
    expect(state.thoughtSent).toBe(false);
    parseThought(state, events);
    expect(state.thoughtSent).toBe(true);
  });
});
