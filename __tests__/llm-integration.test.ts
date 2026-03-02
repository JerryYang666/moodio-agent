/**
 * Real LLM integration tests.
 *
 * These call the actual LLM (gpt-5.2 via OpenAI SDK) with Agent 1's real
 * system prompt and run the output through the real production parsing
 * pipeline. If the LLM output doesn't conform to the expected schemas, the
 * test fails and prints the raw LLM output for human inspection.
 *
 * Requirements:
 *   - LLM_API_KEY must be set in .env (loaded by dotenv)
 *   - Network access to the LLM provider
 *
 * Run only these tests:
 *   npx vitest run __tests__/llm-integration.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import dotenv from "dotenv";

dotenv.config();

import OpenAI from "openai";
import { MessageContentPart } from "@/lib/llm/types";
import { getSystemPrompt } from "@/lib/agents/system-prompts";
import { getVideoModelsPromptText } from "@/lib/video/models";
import {
  validateBufferTags,
  parseFullOutput,
} from "@/lib/agents/parse-agent-output";

const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
];

const LLM_TIMEOUT = 60_000;

let openai: OpenAI;
let systemPrompt: string;

beforeAll(() => {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY not set – cannot run LLM integration tests");
  openai = new OpenAI({ apiKey });

  const raw = getSystemPrompt("agent-1");
  systemPrompt = raw
    .replace("{{SUPPORTED_ASPECT_RATIOS}}", SUPPORTED_ASPECT_RATIOS.join(", "))
    .replace("{{VIDEO_MODELS_INFO}}", getVideoModelsPromptText());
});

async function callLLM(userMessage: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

/**
 * Multi-turn LLM call. Sends a sequence of messages (alternating user/assistant).
 */
async function callLLMMultiTurn(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

/**
 * Run the full production parsing pipeline on raw LLM output.
 * On failure, dumps the raw output to console for human inspection.
 */
function parseLLMOutput(rawOutput: string) {
  try {
    validateBufferTags(rawOutput);
    return parseFullOutput(rawOutput);
  } catch (e) {
    console.error("\n========== RAW LLM OUTPUT (parse failed) ==========");
    console.error(rawOutput);
    console.error("====================================================\n");
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Schema shape validators — check parsed MessageContentPart objects
// against the TypeScript interfaces in lib/llm/types.ts
// ---------------------------------------------------------------------------

function assertValidThinkPart(part: MessageContentPart): void {
  expect(part.type).toBe("internal_think");
  if (part.type !== "internal_think") return;
  expect(typeof part.text).toBe("string");
  expect(part.text.length).toBeGreaterThan(0);
  const lower = part.text.toLowerCase();
  expect(
    lower.includes("belief_prompt") ||
    lower.includes("user_intention") ||
    lower.includes("user_preference") ||
    lower.includes("user_persona")
  ).toBe(true);
}

function assertValidTextPart(part: MessageContentPart): void {
  expect(part.type).toBe("text");
  if (part.type !== "text") return;
  expect(typeof part.text).toBe("string");
  expect(part.text.length).toBeGreaterThan(0);
}

function assertValidAgentImagePart(part: MessageContentPart): void {
  expect(part.type).toBe("agent_image");
  if (part.type !== "agent_image") return;
  expect(typeof part.title).toBe("string");
  expect(part.title.length).toBeGreaterThan(0);
  expect(typeof part.prompt).toBe("string");
  expect(part.prompt.length).toBeGreaterThan(0);
  expect(typeof part.aspectRatio).toBe("string");
  expect(SUPPORTED_ASPECT_RATIOS).toContain(part.aspectRatio);
  expect(["loading", "generated", "error"]).toContain(part.status);
}

function assertValidAgentVideoPart(part: MessageContentPart): void {
  expect(part.type).toBe("agent_video");
  if (part.type !== "agent_video") return;
  expect(part.config).toBeDefined();
  expect(typeof part.config.modelId).toBe("string");
  expect(typeof part.config.modelName).toBe("string");
  expect(typeof part.config.prompt).toBe("string");
  expect(part.config.prompt.length).toBeGreaterThan(0);
  expect(typeof part.config.params).toBe("object");
  expect(["pending", "creating", "created", "error"]).toContain(part.status);
}

function assertValidShotListPart(part: MessageContentPart): void {
  expect(part.type).toBe("agent_shot_list");
  if (part.type !== "agent_shot_list") return;
  expect(typeof part.title).toBe("string");
  expect(part.title.length).toBeGreaterThan(0);
  expect(Array.isArray(part.columns)).toBe(true);
  expect(part.columns.length).toBeGreaterThanOrEqual(1);
  expect(Array.isArray(part.rows)).toBe(true);
  expect(part.rows.length).toBeGreaterThanOrEqual(1);
  for (const row of part.rows) {
    expect(typeof row.id).toBe("string");
    expect(Array.isArray(row.cells)).toBe(true);
    expect(row.cells.length).toBe(part.columns.length);
    for (const cell of row.cells) {
      expect(typeof cell.value).toBe("string");
    }
  }
  expect(["streaming", "complete"]).toContain(part.status);
}

function assertValidSearchPart(part: MessageContentPart): void {
  expect(part.type).toBe("agent_search");
  if (part.type !== "agent_search") return;
  expect(part.query).toBeDefined();
  expect(typeof part.query.textSearch).toBe("string");
  expect(Array.isArray(part.query.filterIds)).toBe(true);
  expect(["pending", "executed"]).toContain(part.status);
}

function assertValidToolCallPart(part: MessageContentPart): void {
  expect(part.type).toBe("tool_call");
  if (part.type !== "tool_call") return;
  expect(typeof part.tool).toBe("string");
  expect(part.tool.length).toBeGreaterThan(0);
  expect(["loading", "complete", "error"]).toContain(part.status);
}

// ---------------------------------------------------------------------------
// TEXT + JSON (image suggestions)
// ---------------------------------------------------------------------------

describe("LLM integration: TEXT + JSON (image suggestions)", () => {
  it(
    "responds with think + TEXT + 4 JSON suggestions for a simple creative prompt",
    async () => {
      const output = await callLLM("I want to create dreamy sunset landscape images");
      const { finalContent } = parseLLMOutput(output);

      const think = finalContent.find((p) => p.type === "internal_think");
      expect(think).toBeDefined();
      assertValidThinkPart(think!);

      const text = finalContent.find((p) => p.type === "text");
      expect(text).toBeDefined();
      assertValidTextPart(text!);

      const images = finalContent.filter((p) => p.type === "agent_image");
      expect(images.length).toBeGreaterThanOrEqual(1);
      expect(images.length).toBeLessThanOrEqual(8);
      for (const img of images) assertValidAgentImagePart(img);
    },
    LLM_TIMEOUT
  );

  it(
    "produces valid image suggestions through the full production pipeline",
    async () => {
      const output = await callLLM("Generate portrait photography ideas with dramatic lighting");
      const { finalContent } = parseLLMOutput(output);

      assertValidThinkPart(finalContent.find((p) => p.type === "internal_think")!);
      assertValidTextPart(finalContent.find((p) => p.type === "text")!);
      const images = finalContent.filter((p) => p.type === "agent_image");
      expect(images.length).toBeGreaterThanOrEqual(1);
      for (const img of images) assertValidAgentImagePart(img);
    },
    LLM_TIMEOUT
  );

  it(
    "respects the 4-suggestion default",
    async () => {
      const output = await callLLM("Create images of cats doing funny things");
      const { finalContent } = parseLLMOutput(output);

      const images = finalContent.filter((p) => p.type === "agent_image");
      expect(images.length).toBe(4);
      for (const img of images) assertValidAgentImagePart(img);
    },
    LLM_TIMEOUT
  );

  it(
    "gives fewer suggestions when asked for just one",
    async () => {
      const output = await callLLM("Give me just one image suggestion of a mountain");
      const { finalContent } = parseLLMOutput(output);

      const images = finalContent.filter((p) => p.type === "agent_image");
      expect(images.length).toBeGreaterThanOrEqual(1);
      expect(images.length).toBeLessThanOrEqual(2);
      for (const img of images) assertValidAgentImagePart(img);
    },
    LLM_TIMEOUT
  );

  it(
    "uses appropriate aspect ratios for landscape vs portrait subjects",
    async () => {
      const output = await callLLM("Create a panoramic ultra-wide cinematic shot of a canyon");
      const { finalContent } = parseLLMOutput(output);

      const images = finalContent.filter((p) => p.type === "agent_image");
      expect(images.length).toBeGreaterThanOrEqual(1);
      for (const img of images) assertValidAgentImagePart(img);

      const ratios = images.map((p) => (p as any).aspectRatio);
      const wideRatios = ["16:9", "21:9", "3:2"];
      expect(ratios.some((r: string) => wideRatios.includes(r))).toBe(true);
    },
    LLM_TIMEOUT
  );

  it(
    "think block contains structured reasoning sections",
    async () => {
      const output = await callLLM("I want moody noir-style portraits");
      const { finalContent } = parseLLMOutput(output);

      const think = finalContent.find((p) => p.type === "internal_think");
      expect(think).toBeDefined();
      assertValidThinkPart(think!);
    },
    LLM_TIMEOUT
  );

  it(
    "each suggestion has a valid aspect ratio from the supported list",
    async () => {
      const output = await callLLM("Create images of different types of architecture");
      const { finalContent } = parseLLMOutput(output);

      const images = finalContent.filter((p) => p.type === "agent_image");
      expect(images.length).toBeGreaterThanOrEqual(1);
      for (const img of images) assertValidAgentImagePart(img);
    },
    LLM_TIMEOUT
  );

  it(
    "each suggestion has a non-empty prompt and title",
    async () => {
      const output = await callLLM("Generate abstract art inspired by music");
      const { finalContent } = parseLLMOutput(output);

      const images = finalContent.filter((p) => p.type === "agent_image");
      expect(images.length).toBeGreaterThanOrEqual(1);
      for (const img of images) assertValidAgentImagePart(img);
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// SHOTLIST
// ---------------------------------------------------------------------------

describe("LLM integration: SHOTLIST", () => {
  it(
    "produces a valid SHOTLIST when asked for a shot list",
    async () => {
      const output = await callLLM(
        "Create a shot list for a 30 second commercial about a coffee brand"
      );
      const { finalContent } = parseLLMOutput(output);

      assertValidTextPart(finalContent.find((p) => p.type === "text")!);

      const shotList = finalContent.find((p) => p.type === "agent_shot_list");
      expect(shotList).toBeDefined();
      assertValidShotListPart(shotList!);
    },
    LLM_TIMEOUT
  );

  it(
    "shot list has appropriate columns and multiple rows",
    async () => {
      const output = await callLLM(
        "Create a detailed shot list table for a 60 second short horror film set in an abandoned hospital. Output a SHOTLIST."
      );
      const { finalContent } = parseLLMOutput(output);

      const shotList = finalContent.find((p) => p.type === "agent_shot_list");
      expect(shotList).toBeDefined();
      assertValidShotListPart(shotList!);
      if (shotList?.type === "agent_shot_list") {
        expect(shotList.columns.length).toBeGreaterThanOrEqual(3);
        expect(shotList.rows.length).toBeGreaterThanOrEqual(3);
      }
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// TOOL_CALL
// ---------------------------------------------------------------------------

describe("LLM integration: TOOL_CALL (search flow)", () => {
  it(
    "emits TOOL_CALL when asked to search/browse content",
    async () => {
      const output = await callLLM("Help me find cinematic dolly zoom shots in the library");
      const { finalContent } = parseLLMOutput(output);

      const toolCall = finalContent.find((p) => p.type === "tool_call");
      expect(toolCall).toBeDefined();
      assertValidToolCallPart(toolCall!);
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// VIDEO
// ---------------------------------------------------------------------------

describe("LLM integration: VIDEO", () => {
  it(
    "produces a valid VIDEO config when asked to create a video with an image in context",
    async () => {
      const output = await callLLMMultiTurn([
        { role: "user", content: "I want a cinematic sunset" },
        {
          role: "assistant",
          content:
            '<think>\nbelief_prompt: User wants a sunset image.\nuser_intention: Generate sunset images.\nuser_preference: - Cinematic style\nuser_persona: Visual creator\n</think>\n<TEXT>Here are some sunset ideas!</TEXT>\n<JSON>{"title":"Golden Sunset","aspectRatio":"16:9","prompt":"A golden sunset over the ocean with dramatic clouds"}</JSON>',
        },
        {
          role: "user",
          content:
            "[Image ID: img-abc123] Suggestion: Golden Sunset\nAspect Ratio: 16:9\nPrompt: A golden sunset over the ocean with dramatic clouds\n\nCreate a video from this image. Animate it with a slow camera push-in and gentle waves.",
        },
      ]);
      const { finalContent } = parseLLMOutput(output);

      assertValidTextPart(finalContent.find((p) => p.type === "text")!);

      const video = finalContent.find((p) => p.type === "agent_video");
      expect(video).toBeDefined();
      assertValidAgentVideoPart(video!);
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// SEARCH (two-turn: TOOL_CALL → taxonomy → SEARCH)
// ---------------------------------------------------------------------------

describe("LLM integration: SEARCH", () => {
  it(
    "produces a valid SEARCH after receiving taxonomy data",
    async () => {
      // Simulate the two-turn flow that happens in production via handleToolCall:
      // 1. User asks to browse → LLM emits TOOL_CALL
      // 2. System provides taxonomy → LLM emits TEXT + SEARCH
      const fakeTaxonomy = [
        "## Camera Movement",
        "  - [id:42] Dolly Zoom — A zoom technique that creates a disorienting visual effect",
        "  - [id:43] Pan — Horizontal camera rotation",
        "  - [id:44] Tracking Shot — Camera follows the subject",
        "## Shot Type",
        "  - [id:50] Close-up",
        "  - [id:51] Wide Shot",
        "  - [id:52] Medium Shot",
        "## Mood",
        "  - [id:60] Tense",
        "  - [id:61] Calm",
        "  - [id:62] Dramatic",
      ].join("\n");

      const output = await callLLMMultiTurn([
        { role: "user", content: "Find me some tense dolly zoom shots" },
        {
          role: "assistant",
          content:
            '<think>\nbelief_prompt: User wants to search for tense dolly zoom content.\nuser_intention: Browse the library with specific filters.\nuser_preference: - Tense mood\nuser_persona: Filmmaker\n</think>\n<TOOL_CALL>{"tool":"CHECK_TAXONOMY","lang":"en"}</TOOL_CALL>',
        },
        {
          role: "user",
          content: `[System: Tool call result for CHECK_TAXONOMY]\n\nHere is the taxonomy tree. Each selectable item has an [id:NUMBER] prefix. Use these IDs in your <SEARCH> filters.\n\n${fakeTaxonomy}`,
        },
      ]);
      const { finalContent } = parseLLMOutput(output);

      assertValidTextPart(finalContent.find((p) => p.type === "text")!);

      const search = finalContent.find((p) => p.type === "agent_search");
      expect(search).toBeDefined();
      assertValidSearchPart(search!);
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// Conversational (no images)
// ---------------------------------------------------------------------------

describe("LLM integration: conversational (no images)", () => {
  it(
    "responds with TEXT for a greeting",
    async () => {
      const output = await callLLM("Hi");
      const { finalContent } = parseLLMOutput(output);

      const text = finalContent.find((p) => p.type === "text");
      expect(text).toBeDefined();
      assertValidTextPart(text!);
    },
    LLM_TIMEOUT
  );

  it(
    "always includes a think block",
    async () => {
      const output = await callLLM("What can you help me with?");
      const { finalContent } = parseLLMOutput(output);

      const think = finalContent.find((p) => p.type === "internal_think");
      expect(think).toBeDefined();
      assertValidThinkPart(think!);
    },
    LLM_TIMEOUT
  );
});
