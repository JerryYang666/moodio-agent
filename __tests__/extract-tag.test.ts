import { describe, it, expect } from "vitest";
import { extractTag } from "@/lib/agents/parse-agent-output";

describe("extractTag", () => {
  it("extracts content between matching tags", () => {
    const result = extractTag("<TEXT>hello</TEXT>", "TEXT");
    expect(result).toEqual({ content: "hello", rest: "" });
  });

  it("returns rest after the closing tag", () => {
    const result = extractTag("<TEXT>hi</TEXT><JSON>{}</JSON>", "TEXT");
    expect(result).toEqual({ content: "hi", rest: "<JSON>{}</JSON>" });
  });

  it("returns null when opening tag is missing", () => {
    expect(extractTag("hello</TEXT>", "TEXT")).toBeNull();
  });

  it("returns null when closing tag is missing", () => {
    expect(extractTag("<TEXT>hello", "TEXT")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractTag("", "TEXT")).toBeNull();
  });

  it("extracts content with inner whitespace and newlines", () => {
    const result = extractTag("<TEXT>\n  multi\n  line\n</TEXT>", "TEXT");
    expect(result?.content).toBe("\n  multi\n  line\n");
  });

  it("extracts only the first occurrence when tag appears twice", () => {
    const buf = "<JSON>first</JSON><JSON>second</JSON>";
    const result = extractTag(buf, "JSON");
    expect(result?.content).toBe("first");
    expect(result?.rest).toBe("<JSON>second</JSON>");
  });

  it("handles content with special characters", () => {
    const result = extractTag('<JSON>{"key": "val & <>"}</JSON>', "JSON");
    expect(result?.content).toBe('{"key": "val & <>"}');
  });

  it("is case-sensitive - lowercase tag does not match uppercase", () => {
    expect(extractTag("<text>hi</text>", "TEXT")).toBeNull();
  });

  it("extracts the think tag (lowercase)", () => {
    const result = extractTag("<think>reasoning here</think>", "think");
    expect(result).toEqual({ content: "reasoning here", rest: "" });
  });
});
