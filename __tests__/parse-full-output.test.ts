import { describe, it, expect } from "vitest";
import { parseFullOutput } from "@/lib/agents/parse-agent-output";

describe("parseFullOutput (multi-tag integration)", () => {
  it("parses think + TEXT + JSON combined", () => {
    const output =
      "<think>The user wants sunset images</think>" +
      "<TEXT>Here are some sunset ideas for you!</TEXT>" +
      '<JSON>{"title":"Golden Hour","aspectRatio":"16:9","prompt":"A golden sunset over the ocean"}</JSON>';
    const { events, finalContent } = parseFullOutput(output);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("internal_think");
    expect(events[1].type).toBe("text");
    expect(events[2].type).toBe("part");
    expect(finalContent).toHaveLength(3);
  });

  it("parses TEXT + VIDEO combined", () => {
    const output =
      "<TEXT>Here is a video configuration</TEXT>" +
      '<VIDEO>{"modelId":"kling-v2","prompt":"A cat walking in a garden"}</VIDEO>';
    const { events, finalContent } = parseFullOutput(output);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("text");
    expect(events[1].part.type).toBe("agent_video");
    expect(finalContent).toHaveLength(2);
  });

  it("parses TEXT + SHOTLIST combined", () => {
    const shotList = {
      title: "Scene Breakdown",
      columns: ["Shot", "Description"],
      rows: [{ id: "1", cells: [{ value: "Wide" }, { value: "Establishing" }] }],
    };
    const output =
      "<TEXT>Here is the shot list</TEXT>" +
      `<SHOTLIST>${JSON.stringify(shotList)}</SHOTLIST>`;
    const { events, finalContent } = parseFullOutput(output);
    expect(events).toHaveLength(3); // text + shot_list_start + part
    expect(finalContent).toHaveLength(2); // text + shot_list
  });

  it("parses TEXT + SEARCH combined", () => {
    const output =
      "<TEXT>Let me find that for you</TEXT>" +
      '<SEARCH>{"text":"cinematic lighting","filters":[10,20]}</SEARCH>';
    const { events, finalContent } = parseFullOutput(output);
    expect(events).toHaveLength(2);
    expect(finalContent).toHaveLength(2);
    expect(finalContent[1].type).toBe("agent_search");
  });

  it("parses TEXT + TOOL_CALL combined", () => {
    const output =
      "<TEXT>Let me check the taxonomy</TEXT>" +
      '<TOOL_CALL>{"tool":"CHECK_TAXONOMY","lang":"en"}</TOOL_CALL>';
    const { events, finalContent } = parseFullOutput(output);
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe("tool_call");
    expect(finalContent).toHaveLength(2);
  });

  it("parses think + TEXT + multiple JSON suggestions", () => {
    const output =
      "<think>Creative brainstorming for portrait photography</think>" +
      "<TEXT>Here are portrait photography ideas</TEXT>" +
      '<JSON>{"title":"Studio Portrait","aspectRatio":"2:3","prompt":"Professional studio portrait"}</JSON>' +
      '<JSON>{"title":"Environmental","aspectRatio":"3:2","prompt":"Environmental portrait outdoors"}</JSON>' +
      '<JSON>{"title":"Dramatic","aspectRatio":"4:5","prompt":"Dramatic lighting portrait"}</JSON>';
    const { events, finalContent } = parseFullOutput(output);
    expect(events).toHaveLength(5); // think + text + 3 parts
    expect(finalContent).toHaveLength(5);
    const imageParts = finalContent.filter((p) => p.type === "agent_image");
    expect(imageParts).toHaveLength(3);
  });

  it("throws on invalid output with text outside tags", () => {
    expect(() => parseFullOutput("bare text outside")).toThrow(/text outside tags/);
  });

  it("handles a realistic full agent response", () => {
    const output =
      "<think>The user wants cinematic storyboard images. I should create varied compositions.</think>" +
      "<TEXT>I have created a cinematic storyboard for your short film concept. Each image captures a different mood and camera angle.</TEXT>" +
      '<JSON>{"title":"Opening Wide Shot","aspectRatio":"21:9","prompt":"Cinematic wide establishing shot of a dystopian city at dawn, volumetric fog, neon lights reflecting on wet streets, ultra wide angle lens, film grain"}</JSON>' +
      '<JSON>{"title":"Character Close-up","aspectRatio":"2:3","prompt":"Extreme close-up portrait of a cyberpunk character, neon reflections in eyes, shallow depth of field, anamorphic lens flare"}</JSON>' +
      '<JSON>{"title":"Action Sequence","aspectRatio":"16:9","prompt":"Dynamic action shot through rain-soaked alley, motion blur, dramatic side lighting, cinematic color grading"}</JSON>' +
      '<JSON>{"title":"Emotional Moment","aspectRatio":"4:5","prompt":"Intimate moment between two characters silhouetted against a sunset, warm tones, soft focus background, golden hour lighting"}</JSON>';
    const { events, finalContent, state } = parseFullOutput(output);
    expect(state.thoughtSent).toBe(true);
    expect(state.questionSent).toBe(true);
    expect(state.suggestionIndex).toBe(4);
    expect(finalContent.filter((p) => p.type === "internal_think")).toHaveLength(1);
    expect(finalContent.filter((p) => p.type === "text")).toHaveLength(1);
    expect(finalContent.filter((p) => p.type === "agent_image")).toHaveLength(4);
  });

  it("handles whitespace between tags", () => {
    const output = "<TEXT>hello</TEXT>\n\n  \n<JSON>{\"title\":\"x\",\"aspectRatio\":\"1:1\",\"prompt\":\"p\"}</JSON>\n";
    const { events } = parseFullOutput(output);
    expect(events).toHaveLength(2);
  });

  it("returns empty events for whitespace-only input", () => {
    const { events, finalContent } = parseFullOutput("   \n\t  ");
    expect(events).toHaveLength(0);
    expect(finalContent).toHaveLength(0);
  });
});
