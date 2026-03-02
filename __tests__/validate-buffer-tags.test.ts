import { describe, it, expect } from "vitest";
import { validateBufferTags } from "@/lib/agents/parse-agent-output";

describe("validateBufferTags", () => {
  it("accepts an empty string", () => {
    expect(() => validateBufferTags("")).not.toThrow();
  });

  it("accepts whitespace-only outside tags", () => {
    expect(() => validateBufferTags("  \n\t  ")).not.toThrow();
  });

  it("accepts valid TEXT tag", () => {
    expect(() => validateBufferTags("<TEXT>Hello world</TEXT>")).not.toThrow();
  });

  it("accepts valid JSON tag", () => {
    expect(() => validateBufferTags('<JSON>{"title":"x"}</JSON>')).not.toThrow();
  });

  it("accepts multiple valid tags with whitespace between", () => {
    expect(() =>
      validateBufferTags("<TEXT>Hi</TEXT>\n<JSON>{}</JSON>")
    ).not.toThrow();
  });

  it("accepts all valid tag types", () => {
    const buffer =
      "<think>reasoning</think>\n" +
      "<TEXT>question</TEXT>\n" +
      '<JSON>{"title":"a","aspectRatio":"1:1","prompt":"p"}</JSON>\n' +
      '<VIDEO>{"modelId":"m","prompt":"p"}</VIDEO>\n' +
      '<SHOTLIST>{"title":"s","columns":[],"rows":[]}</SHOTLIST>\n' +
      '<SEARCH>{"text":"q","filters":[]}</SEARCH>\n' +
      '<TOOL_CALL>{"tool":"CHECK_TAXONOMY","lang":"en"}</TOOL_CALL>';
    expect(() => validateBufferTags(buffer)).not.toThrow();
  });

  it("accepts incomplete opening tag (streaming scenario)", () => {
    expect(() => validateBufferTags("<TEX")).not.toThrow();
  });

  it("throws on bare text outside any tag", () => {
    expect(() => validateBufferTags("hello world")).toThrow(
      /text outside tags/
    );
  });

  it("throws on text between two closed tags", () => {
    expect(() =>
      validateBufferTags("<TEXT>ok</TEXT>INVALID<JSON>{}</JSON>")
    ).toThrow(/text outside tags/);
  });

  it("throws on text before the first tag", () => {
    expect(() => validateBufferTags("oops<TEXT>hi</TEXT>")).toThrow(
      /text outside tags/
    );
  });
});
