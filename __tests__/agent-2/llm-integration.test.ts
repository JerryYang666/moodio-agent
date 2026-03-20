/**
 * Real LLM integration tests for Agent 2.
 *
 * These call the actual LLM via Agent 2's full pipeline:
 *   SystemPromptConstructor → InputParser → LLM → OutputParser → StreamLoop
 *
 * The tests verify what events are sent to the frontend (via ctx.send) and
 * what finalContent is returned. External services (image generation,
 * taxonomy fetch, S3, credits) are mocked so only the LLM call is real.
 *
 * Requirements:
 *   - LLM_API_KEY must be set in .env
 *   - Network access to the LLM provider
 *
 * Run only these tests:
 *   npx vitest run __tests__/agent-2/llm-integration.test.ts
 */
import { describe, it, expect, beforeAll, vi, type Mock } from "vitest";
import dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------------
// Mock external services BEFORE any agent-2 imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/storage/s3", () => {
  let counter = 0;
  return {
    downloadImage: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
    uploadImage: vi.fn().mockImplementation((_buf: any, _ct: any, id?: string) =>
      Promise.resolve(id ?? `uploaded-${++counter}`)
    ),
    getSignedImageUrl: vi.fn().mockImplementation((id: string) => `https://cdn.test/${id}`),
    generateImageId: vi.fn().mockImplementation(() => `img-${++counter}-${Date.now()}`),
  };
});

vi.mock("@/lib/image/service", () => ({
  generateImageWithModel: vi.fn().mockResolvedValue({
    imageBuffer: Buffer.from("fake"),
    contentType: "image/png",
    provider: "google",
    modelId: "test-model",
    providerModelId: "test-provider-model",
    response: {},
  }),
  editImageWithModel: vi.fn().mockResolvedValue({
    imageBuffer: Buffer.from("fake"),
    contentType: "image/png",
    provider: "google",
    modelId: "test-model",
    providerModelId: "test-provider-model",
    response: {},
  }),
}));

vi.mock("@/lib/image/models", () => ({
  getImageModel: vi.fn().mockReturnValue({ provider: "google" }),
}));

vi.mock("@/lib/pricing", () => ({
  calculateCost: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/credits", () => ({
  deductCredits: vi.fn().mockResolvedValue(undefined),
  getUserBalance: vi.fn().mockResolvedValue(1000),
  InsufficientCreditsError: class extends Error {
    constructor() {
      super("Insufficient credits");
      this.name = "InsufficientCreditsError";
    }
  },
}));

vi.mock("@/lib/telemetry", () => ({
  recordEvent: vi.fn().mockResolvedValue(undefined),
  sanitizeGeminiResponse: vi.fn().mockImplementation((r: any) => r),
}));

vi.mock("@/lib/agents/taxonomy-tool", () => ({
  fetchTaxonomyTree: vi.fn().mockResolvedValue([]),
  serializeTaxonomyForLLM: vi.fn().mockReturnValue(
    [
      "## Camera Movement",
      "  - [id:42] Dolly Zoom — A zoom technique",
      "  - [id:43] Pan — Horizontal camera rotation",
      "## Shot Type",
      "  - [id:50] Close-up",
      "  - [id:51] Wide Shot",
      "## Mood",
      "  - [id:60] Tense",
      "  - [id:61] Calm",
    ].join("\n")
  ),
  parseToolCallBody: vi.fn().mockImplementation((body: string) => JSON.parse(body)),
}));

// ---------------------------------------------------------------------------
// Now import Agent 2 modules (after mocks are set up)
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import { MessageContentPart, DEFAULT_LLM_MODEL, Message } from "@/lib/llm/types";
import { StreamEvent, createRequestContext, RequestContext } from "@/lib/agents/agent-2/context";
import { ToolRegistry } from "@/lib/agents/agent-2/tools/registry";
import { SystemPromptConstructor } from "@/lib/agents/agent-2/core/system-prompt";
import { InputParser } from "@/lib/agents/agent-2/core/input-parser";
import { OutputParser } from "@/lib/agents/agent-2/core/output-parser";
import { StreamLoop } from "@/lib/agents/agent-2/core/stream-loop";
import { ToolExecutor } from "@/lib/agents/agent-2/executor/tool-executor";
import { CheckTaxonomyHandler } from "@/lib/agents/agent-2/executor/handlers/check-taxonomy";
import { ImageGenerateHandler } from "@/lib/agents/agent-2/executor/handlers/image-generate";

import { thinkTool } from "@/lib/agents/agent-2/tools/think";
import { textTool } from "@/lib/agents/agent-2/tools/text";
import { imageSuggestTool } from "@/lib/agents/agent-2/tools/image-suggest";
import { videoSuggestTool } from "@/lib/agents/agent-2/tools/video-suggest";
import { videoTool } from "@/lib/agents/agent-2/tools/video";
import { shotListTool } from "@/lib/agents/agent-2/tools/shot-list";
import { searchTool } from "@/lib/agents/agent-2/tools/search";
import { checkTaxonomyTool } from "@/lib/agents/agent-2/tools/check-taxonomy";
import { suggestionsTool } from "@/lib/agents/agent-2/tools/suggestions";
import { askUserTool } from "@/lib/agents/agent-2/tools/ask-user";

const LLM_TIMEOUT = 120_000; // higher timeout to accommodate tool-call two-turn

const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let openai: OpenAI;

function buildRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register(thinkTool);
  reg.register(textTool);
  reg.register(imageSuggestTool);
  reg.register(videoSuggestTool);
  reg.register(videoTool);
  reg.register(shotListTool);
  reg.register(searchTool);
  reg.register(checkTaxonomyTool);
  reg.register(suggestionsTool);
  reg.register(askUserTool);
  return reg;
}

interface PipelineResult {
  events: StreamEvent[];
  finalContent: MessageContentPart[];
}

/**
 * Run a single-turn request through the full Agent 2 pipeline.
 * Returns all frontend events emitted via ctx.send and the final content parts.
 */
async function runPipeline(
  userContent: string,
  history: Message[] = [],
): Promise<PipelineResult> {
  const events: StreamEvent[] = [];
  const registry = buildRegistry();
  const promptConstructor = new SystemPromptConstructor(registry);
  const inputParser = new InputParser();

  const ctx = createRequestContext({
    userId: "test-user",
    isAdmin: true,
    requestStartTime: Date.now(),
    send: (event: StreamEvent) => events.push(event),
  });

  const systemPrompt = promptConstructor.build();
  const historyMessages = inputParser.parseHistory(history, ctx);
  const userMsg = inputParser.parseUserMessage(
    { role: "user", content: userContent },
    ctx,
  );

  const preparedMessages = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    userMsg,
  ];

  const llmStream = await openai.chat.completions.create({
    model: DEFAULT_LLM_MODEL,
    messages: preparedMessages as any,
    stream: true,
  });

  const toolExecutor = new ToolExecutor(registry);
  toolExecutor.registerHandler("check_taxonomy", new CheckTaxonomyHandler());
  toolExecutor.registerHandler("image_suggest", new ImageGenerateHandler());
  toolExecutor.registerHandler("video_suggest", new ImageGenerateHandler());

  const outputParser = new OutputParser(registry);
  const streamLoop = new StreamLoop(outputParser, toolExecutor, registry);

  const finalContent = await streamLoop.run(llmStream, ctx, preparedMessages);

  return { events, finalContent };
}

/**
 * Run a multi-turn request (with pre-built history) through the pipeline.
 */
async function runPipelineMultiTurn(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<PipelineResult> {
  const last = messages[messages.length - 1];
  const history: Message[] = messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return runPipeline(last.content, history);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY not set – cannot run Agent 2 LLM integration tests");
  openai = new OpenAI({ apiKey });
});

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assertThinkEvent(events: StreamEvent[]): void {
  const think = events.find((e) => e.type === "internal_think");
  expect(think).toBeDefined();
  expect(typeof think!.content).toBe("string");
  expect(think!.content.length).toBeGreaterThan(0);
  const lower = think!.content.toLowerCase();
  expect(
    lower.includes("belief_prompt") ||
    lower.includes("user_intention") ||
    lower.includes("user_preference") ||
    lower.includes("user_persona")
  ).toBe(true);
}

function assertTextEvent(events: StreamEvent[]): void {
  const text = events.find((e) => e.type === "text");
  expect(text).toBeDefined();
  expect(typeof text!.content).toBe("string");
  expect(text!.content.length).toBeGreaterThan(0);
}

function assertImageEvents(events: StreamEvent[], minCount = 1, maxCount = 6): void {
  const placeholders = events.filter(
    (e) => e.type === "part" && e.part?.type === "agent_image" && e.part?.status === "loading"
  );
  expect(placeholders.length).toBeGreaterThanOrEqual(minCount);
  expect(placeholders.length).toBeLessThanOrEqual(maxCount);

  // Each placeholder should have a unique imageId
  const ids = placeholders.map((e) => e.part.imageId);
  expect(new Set(ids).size).toBe(ids.length);

  // Each should get an update (generated or error)
  for (const id of ids) {
    const update = events.find(
      (e) => e.type === "part_update" && e.imageId === id
    );
    expect(update).toBeDefined();
    expect(["generated", "error"]).toContain(update!.part.status);
  }
}

function assertNoImageDuplicates(events: StreamEvent[]): void {
  const placeholders = events.filter(
    (e) => e.type === "part" && e.part?.type === "agent_image" && e.part?.status === "loading"
  );
  const ids = placeholders.map((e) => e.part.imageId);
  expect(new Set(ids).size).toBe(ids.length);
}

function assertThinkFinalContent(finalContent: MessageContentPart[]): void {
  const think = finalContent.find((p) => p.type === "internal_think");
  expect(think).toBeDefined();
  if (think?.type === "internal_think") {
    expect(think.text.length).toBeGreaterThan(0);
  }
}

function assertTextFinalContent(finalContent: MessageContentPart[]): void {
  const text = finalContent.find((p) => p.type === "text");
  expect(text).toBeDefined();
  if (text?.type === "text") {
    expect(text.text.length).toBeGreaterThan(0);
  }
}

function assertImageFinalContent(finalContent: MessageContentPart[], minCount = 1, maxCount = 6): void {
  const images = finalContent.filter((p) => p.type === "agent_image");
  expect(images.length).toBeGreaterThanOrEqual(minCount);
  expect(images.length).toBeLessThanOrEqual(maxCount);

  for (const img of images) {
    if (img.type !== "agent_image") continue;
    expect(["generated", "error"]).toContain(img.status);
    expect(typeof img.prompt).toBe("string");
    expect(img.prompt.length).toBeGreaterThan(0);
    if (img.status === "generated") {
      expect(typeof img.aspectRatio).toBe("string");
      expect(SUPPORTED_ASPECT_RATIOS).toContain(img.aspectRatio);
    }
  }
}

// ---------------------------------------------------------------------------
// TEXT + JSON (image suggestions)
// ---------------------------------------------------------------------------

describe("Agent 2 LLM integration: TEXT + JSON (image suggestions)", () => {
  it(
    "sends think, text, and image events for a simple creative prompt",
    async () => {
      const { events, finalContent } = await runPipeline(
        "I want to create dreamy sunset landscape images"
      );

      // Check frontend events
      assertThinkEvent(events);
      assertTextEvent(events);
      assertImageEvents(events);
      assertNoImageDuplicates(events);

      // Check finalContent
      assertThinkFinalContent(finalContent);
      assertTextFinalContent(finalContent);
      assertImageFinalContent(finalContent);
    },
    LLM_TIMEOUT
  );

  it(
    "respects the 4-suggestion default",
    async () => {
      const { events, finalContent } = await runPipeline(
        "Create images of cats doing funny things"
      );

      const placeholders = events.filter(
        (e) => e.type === "part" && e.part?.type === "agent_image"
      );
      expect(placeholders.length).toBe(4);
      assertNoImageDuplicates(events);

      const images = finalContent.filter((p) => p.type === "agent_image");
      expect(images.length).toBe(4);
    },
    LLM_TIMEOUT
  );

  it(
    "gives fewer suggestions when asked for just one",
    async () => {
      const { events, finalContent } = await runPipeline(
        "Give me just one image suggestion of a mountain"
      );

      const placeholders = events.filter(
        (e) => e.type === "part" && e.part?.type === "agent_image"
      );
      expect(placeholders.length).toBeGreaterThanOrEqual(1);
      expect(placeholders.length).toBeLessThanOrEqual(2);
      assertNoImageDuplicates(events);
    },
    LLM_TIMEOUT
  );

  it(
    "uses appropriate wide aspect ratios for panoramic prompts",
    async () => {
      const { finalContent } = await runPipeline(
        "Generate 4 image suggestions of a panoramic ultra-wide cinematic shot of a canyon at golden hour"
      );

      const images = finalContent.filter((p) => p.type === "agent_image");
      expect(images.length).toBeGreaterThanOrEqual(1);
      const ratios = images.map((p) => (p as any).aspectRatio);
      const wideRatios = ["16:9", "21:9", "3:2"];
      expect(ratios.some((r: string) => wideRatios.includes(r))).toBe(true);
    },
    LLM_TIMEOUT
  );

  it(
    "each image gets exactly one placeholder and one update (no duplicates)",
    async () => {
      const { events } = await runPipeline(
        "Generate portrait photography ideas with dramatic lighting"
      );

      const placeholders = events.filter(
        (e) => e.type === "part" && e.part?.type === "agent_image" && e.part?.status === "loading"
      );
      const updates = events.filter((e) => e.type === "part_update");

      // Each placeholder should map 1:1 to an update
      expect(updates.length).toBe(placeholders.length);

      // No duplicate imageIds in placeholders
      const placeholderIds = placeholders.map((e) => e.part.imageId);
      expect(new Set(placeholderIds).size).toBe(placeholderIds.length);

      // Each update references a known placeholder id
      for (const update of updates) {
        expect(placeholderIds).toContain(update.imageId);
      }
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// SHOTLIST
// ---------------------------------------------------------------------------

describe("Agent 2 LLM integration: SHOTLIST", () => {
  it(
    "sends shot_list_start and shot list part for shot list request",
    async () => {
      const { events, finalContent } = await runPipeline(
        "Create a shot list for a 30 second commercial about a coffee brand"
      );

      // Should have shot_list_start event
      const shotListStart = events.find((e) => e.type === "shot_list_start");
      expect(shotListStart).toBeDefined();

      // Should have the actual shot list part event
      const shotListPart = events.find(
        (e) => e.type === "part" && e.part?.type === "agent_shot_list"
      );
      expect(shotListPart).toBeDefined();
      expect(shotListPart!.part.title.length).toBeGreaterThan(0);
      expect(Array.isArray(shotListPart!.part.columns)).toBe(true);
      expect(shotListPart!.part.columns.length).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(shotListPart!.part.rows)).toBe(true);
      expect(shotListPart!.part.rows.length).toBeGreaterThanOrEqual(3);

      // Verify each row has cells matching column count
      for (const row of shotListPart!.part.rows) {
        expect(typeof row.id).toBe("string");
        expect(row.cells.length).toBe(shotListPart!.part.columns.length);
      }

      // Check finalContent
      assertTextFinalContent(finalContent);
      const shotListContent = finalContent.find((p) => p.type === "agent_shot_list");
      expect(shotListContent).toBeDefined();
      if (shotListContent?.type === "agent_shot_list") {
        expect(shotListContent.status).toBe("complete");
      }

      // Should NOT have image events (shot list is separate)
      const imageParts = events.filter(
        (e) => e.type === "part" && e.part?.type === "agent_image"
      );
      expect(imageParts.length).toBe(0);
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// TOOL_CALL (CHECK_TAXONOMY) → SEARCH
// ---------------------------------------------------------------------------

describe("Agent 2 LLM integration: TOOL_CALL + SEARCH (full two-turn)", () => {
  it(
    "handles CHECK_TAXONOMY tool call and emits search results",
    async () => {
      const { events, finalContent } = await runPipeline(
        "Help me find cinematic dolly zoom shots in the library"
      );

      // Should have tool_call loading + complete events
      const toolCallLoading = events.find(
        (e) => e.type === "tool_call" && e.status === "loading"
      );
      expect(toolCallLoading).toBeDefined();
      expect(toolCallLoading!.tool).toBe("check_taxonomy");

      const toolCallComplete = events.find(
        (e) => e.type === "tool_call" && e.status === "complete"
      );
      expect(toolCallComplete).toBeDefined();

      // After the tool call completes, should have a search event
      const searchPart = events.find(
        (e) => e.type === "part" && e.part?.type === "agent_search"
      );
      expect(searchPart).toBeDefined();
      expect(searchPart!.part.query).toBeDefined();
      expect(typeof searchPart!.part.query.textSearch).toBe("string");
      expect(Array.isArray(searchPart!.part.query.filterIds)).toBe(true);

      // Should have text explaining the search
      assertTextEvent(events);

      // Check finalContent
      const toolCallContent = finalContent.find((p) => p.type === "tool_call");
      expect(toolCallContent).toBeDefined();
      if (toolCallContent?.type === "tool_call") {
        expect(toolCallContent.status).toBe("complete");
      }

      const searchContent = finalContent.find((p) => p.type === "agent_search");
      expect(searchContent).toBeDefined();
      if (searchContent?.type === "agent_search") {
        expect(searchContent.status).toBe("pending");
      }

      assertTextFinalContent(finalContent);

      // Should NOT have image events
      const imageParts = events.filter(
        (e) => e.type === "part" && e.part?.type === "agent_image"
      );
      expect(imageParts.length).toBe(0);
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// VIDEO
// ---------------------------------------------------------------------------

describe("Agent 2 LLM integration: VIDEO", () => {
  it(
    "sends a video config event when asked to create a video with image context",
    async () => {
      const { events, finalContent } = await runPipelineMultiTurn([
        { role: "user", content: "I want a cinematic sunset" },
        {
          role: "assistant",
          content:
            '<think>\nbelief_prompt: User wants a sunset image.\nuser_intention: Generate sunset images.\nuser_preference: - Cinematic style\nuser_persona: Visual creator\n</think>\n<TEXT>Here are some sunset ideas!</TEXT>\n<JSON>{"title":"Golden Sunset","aspectRatio":"16:9","prompt":"A golden sunset over the ocean"}</JSON>',
        },
        {
          role: "user",
          content:
            "[Image ID: img-abc123] Suggestion: Golden Sunset\nAspect Ratio: 16:9\nPrompt: A golden sunset over the ocean\n\nCreate a video from this image. Animate it with a slow camera push-in and gentle waves.",
        },
      ]);

      // Should have a video part event
      const videoPart = events.find(
        (e) => e.type === "part" && e.part?.type === "agent_video"
      );
      expect(videoPart).toBeDefined();
      expect(videoPart!.part.config).toBeDefined();
      expect(typeof videoPart!.part.config.modelId).toBe("string");
      expect(typeof videoPart!.part.config.modelName).toBe("string");
      expect(typeof videoPart!.part.config.prompt).toBe("string");
      expect(videoPart!.part.config.prompt.length).toBeGreaterThan(0);
      expect(videoPart!.part.status).toBe("pending");

      // Should also have text explaining the video
      assertTextEvent(events);

      // Check finalContent
      assertTextFinalContent(finalContent);
      const videoContent = finalContent.find((p) => p.type === "agent_video");
      expect(videoContent).toBeDefined();
      if (videoContent?.type === "agent_video") {
        expect(videoContent.status).toBe("pending");
        expect(typeof videoContent.config.modelId).toBe("string");
        expect(typeof videoContent.config.prompt).toBe("string");
      }

      // Should NOT have image suggestion events
      const imageParts = events.filter(
        (e) => e.type === "part" && e.part?.type === "agent_image"
      );
      expect(imageParts.length).toBe(0);
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// Conversational (no images)
// ---------------------------------------------------------------------------

describe("Agent 2 LLM integration: conversational (no images)", () => {
  it(
    "responds with think + text events for a greeting",
    async () => {
      const { events, finalContent } = await runPipeline("Hi");

      assertThinkEvent(events);
      assertTextEvent(events);

      assertThinkFinalContent(finalContent);
      assertTextFinalContent(finalContent);

      // Should not have any image/video/search events (suggestions and ask_user parts are allowed)
      const partEvents = events.filter(
        (e) => e.type === "part" && e.part?.type !== "suggestions" && e.part?.type !== "agent_ask_user"
      );
      expect(partEvents.length).toBe(0);
    },
    LLM_TIMEOUT
  );

  it(
    "always includes a think block with structured reasoning",
    async () => {
      const { events, finalContent } = await runPipeline("What can you help me with?");

      assertThinkEvent(events);
      assertThinkFinalContent(finalContent);

      // The think content should have structured sections
      const think = finalContent.find((p) => p.type === "internal_think");
      if (think?.type === "internal_think") {
        const lower = think.text.toLowerCase();
        expect(
          lower.includes("belief_prompt") ||
          lower.includes("user_intention")
        ).toBe(true);
      }
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// Event ordering + no duplicates (regression for the double-emit bug)
// ---------------------------------------------------------------------------

describe("Agent 2 LLM integration: event ordering and uniqueness", () => {
  it(
    "think event comes before text event which comes before image events",
    async () => {
      const { events } = await runPipeline("Create 4 cute puppy images");

      const thinkIdx = events.findIndex((e) => e.type === "internal_think");
      const textIdx = events.findIndex((e) => e.type === "text");
      const firstImageIdx = events.findIndex(
        (e) => e.type === "part" && e.part?.type === "agent_image"
      );

      expect(thinkIdx).toBeLessThan(textIdx);
      expect(textIdx).toBeLessThan(firstImageIdx);
    },
    LLM_TIMEOUT
  );

  it(
    "never sends duplicate loading placeholders for the same imageId",
    async () => {
      const { events } = await runPipeline(
        "Generate abstract art images inspired by jazz music"
      );

      const loadingEvents = events.filter(
        (e) => e.type === "part" && e.part?.type === "agent_image" && e.part?.status === "loading"
      );
      const ids = loadingEvents.map((e) => e.part.imageId);
      expect(new Set(ids).size).toBe(ids.length);
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// VIDEO_SUGGEST
// ---------------------------------------------------------------------------

function assertVideoSuggestEvents(events: StreamEvent[], minCount = 1, maxCount = 6): void {
  const placeholders = events.filter(
    (e) => e.type === "part" && e.part?.type === "agent_video_suggest" && e.part?.status === "loading"
  );
  expect(placeholders.length).toBeGreaterThanOrEqual(minCount);
  expect(placeholders.length).toBeLessThanOrEqual(maxCount);

  const ids = placeholders.map((e) => e.part.imageId);
  expect(new Set(ids).size).toBe(ids.length);

  for (const id of ids) {
    const update = events.find(
      (e) => e.type === "part_update" && e.imageId === id
    );
    expect(update).toBeDefined();
    expect(["generated", "error"]).toContain(update!.part.status);
  }
}

function assertVideoSuggestFinalContent(finalContent: MessageContentPart[], minCount = 1, maxCount = 6): void {
  const parts = finalContent.filter((p) => p.type === "agent_video_suggest");
  expect(parts.length).toBeGreaterThanOrEqual(minCount);
  expect(parts.length).toBeLessThanOrEqual(maxCount);

  for (const part of parts) {
    if (part.type !== "agent_video_suggest") continue;
    expect(["generated", "error"]).toContain(part.status);
    expect(typeof part.prompt).toBe("string");
    expect(part.prompt.length).toBeGreaterThan(0);
    expect(typeof part.videoIdea).toBe("string");
    expect(part.videoIdea.length).toBeGreaterThan(0);
    if (part.status === "generated") {
      expect(typeof part.aspectRatio).toBe("string");
      expect(SUPPORTED_ASPECT_RATIOS).toContain(part.aspectRatio);
    }
  }
}

describe("Agent 2 LLM integration: VIDEO_SUGGEST", () => {
  it(
    "sends think, text, and video suggest events for a video idea request",
    async () => {
      const { events, finalContent } = await runPipeline(
        "Give me 4 video ideas for a travel vlog about Tokyo"
      );

      assertThinkEvent(events);
      assertTextEvent(events);
      assertVideoSuggestEvents(events);

      assertThinkFinalContent(finalContent);
      assertTextFinalContent(finalContent);
      assertVideoSuggestFinalContent(finalContent);
    },
    LLM_TIMEOUT
  );

  it(
    "defaults to 4 video suggestions",
    async () => {
      const { events, finalContent } = await runPipeline(
        "Suggest video ideas for a coffee brand promotion"
      );

      const placeholders = events.filter(
        (e) => e.type === "part" && e.part?.type === "agent_video_suggest"
      );
      expect(placeholders.length).toBe(4);

      const parts = finalContent.filter((p) => p.type === "agent_video_suggest");
      expect(parts.length).toBe(4);
    },
    LLM_TIMEOUT
  );

  it(
    "each video suggest part contains a videoIdea field",
    async () => {
      const { finalContent } = await runPipeline(
        "Give me 4 video ideas for an underwater nature documentary"
      );

      const parts = finalContent.filter((p) => p.type === "agent_video_suggest");
      expect(parts.length).toBeGreaterThanOrEqual(1);

      for (const part of parts) {
        if (part.type !== "agent_video_suggest") continue;
        expect(typeof part.videoIdea).toBe("string");
        expect(part.videoIdea.length).toBeGreaterThan(10);
      }
    },
    LLM_TIMEOUT
  );

  it(
    "each video suggest gets exactly one placeholder and one update",
    async () => {
      const { events } = await runPipeline(
        "Suggest 4 video ideas for a fitness workout series"
      );

      const placeholders = events.filter(
        (e) => e.type === "part" && e.part?.type === "agent_video_suggest" && e.part?.status === "loading"
      );
      const updates = events.filter(
        (e) => e.type === "part_update" && e.part?.type === "agent_video_suggest"
      );

      expect(updates.length).toBe(placeholders.length);

      const placeholderIds = placeholders.map((e) => e.part.imageId);
      expect(new Set(placeholderIds).size).toBe(placeholderIds.length);

      for (const update of updates) {
        expect(placeholderIds).toContain(update.imageId);
      }
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// SUGGESTIONS (post-message follow-up actions)
// ---------------------------------------------------------------------------

function assertSuggestionsEvent(events: StreamEvent[]): void {
  const suggEvent = events.find(
    (e) => e.type === "part" && e.part?.type === "suggestions"
  );
  expect(suggEvent).toBeDefined();
  expect(Array.isArray(suggEvent!.part.suggestions)).toBe(true);
  expect(suggEvent!.part.suggestions.length).toBeGreaterThanOrEqual(1);
  expect(suggEvent!.part.suggestions.length).toBeLessThanOrEqual(3);

  for (const s of suggEvent!.part.suggestions) {
    expect(typeof s.label).toBe("string");
    expect(s.label.length).toBeGreaterThan(0);
    expect(typeof s.promptText).toBe("string");
    expect(s.promptText.length).toBeGreaterThan(0);
  }
}

function assertSuggestionsFinalContent(finalContent: MessageContentPart[]): void {
  const suggPart = finalContent.find((p) => p.type === "suggestions");
  expect(suggPart).toBeDefined();
  if (suggPart?.type === "suggestions") {
    expect(Array.isArray(suggPart.suggestions)).toBe(true);
    expect(suggPart.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggPart.suggestions.length).toBeLessThanOrEqual(3);

    for (const s of suggPart.suggestions) {
      expect(typeof s.label).toBe("string");
      expect(typeof s.promptText).toBe("string");
    }
  }
}

describe("Agent 2 LLM integration: SUGGESTIONS (post-message)", () => {
  it(
    "emits suggestions after a creative prompt with image generation",
    async () => {
      const { events, finalContent } = await runPipeline(
        "I want to create dreamy sunset landscape images. Please also suggest follow-up actions I can take."
      );

      // Should have the standard events
      assertThinkEvent(events);
      assertTextEvent(events);

      // Should have a suggestions part event
      assertSuggestionsEvent(events);

      // Check finalContent
      assertThinkFinalContent(finalContent);
      assertTextFinalContent(finalContent);
      assertSuggestionsFinalContent(finalContent);
    },
    LLM_TIMEOUT
  );

  it(
    "suggestions have valid structure with label, promptText, and optional icon",
    async () => {
      const { finalContent } = await runPipeline(
        "Help me design a game character. Please suggest follow-up actions."
      );

      const suggPart = finalContent.find((p) => p.type === "suggestions");
      expect(suggPart).toBeDefined();
      if (suggPart?.type === "suggestions") {
        for (const s of suggPart.suggestions) {
          expect(typeof s.label).toBe("string");
          expect(s.label.split(" ").length).toBeLessThanOrEqual(8);
          expect(typeof s.promptText).toBe("string");
          expect(s.promptText.length).toBeGreaterThan(0);
          if (s.icon !== undefined) {
            expect(typeof s.icon).toBe("string");
          }
        }
      }
    },
    LLM_TIMEOUT
  );
});

// ---------------------------------------------------------------------------
// ASK_USER (structured questions for the user)
// ---------------------------------------------------------------------------

function assertAskUserEvent(events: StreamEvent[]): void {
  const askEvent = events.find(
    (e) => e.type === "part" && e.part?.type === "agent_ask_user"
  );
  expect(askEvent).toBeDefined();
  expect(Array.isArray(askEvent!.part.questions)).toBe(true);
  expect(askEvent!.part.questions.length).toBeGreaterThanOrEqual(1);
  expect(askEvent!.part.questions.length).toBeLessThanOrEqual(3);

  for (const q of askEvent!.part.questions) {
    expect(typeof q.id).toBe("string");
    expect(q.id.length).toBeGreaterThan(0);
    expect(typeof q.question).toBe("string");
    expect(q.question.length).toBeGreaterThan(0);
    expect(Array.isArray(q.options)).toBe(true);
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    expect(q.options.length).toBeLessThanOrEqual(4);
    for (const opt of q.options) {
      expect(typeof opt).toBe("string");
    }
  }
}

function assertAskUserFinalContent(finalContent: MessageContentPart[]): void {
  const askPart = finalContent.find((p) => p.type === "agent_ask_user");
  expect(askPart).toBeDefined();
  if (askPart?.type === "agent_ask_user") {
    expect(Array.isArray(askPart.questions)).toBe(true);
    expect(askPart.questions.length).toBeGreaterThanOrEqual(1);
    expect(askPart.questions.length).toBeLessThanOrEqual(3);

    for (const q of askPart.questions) {
      expect(typeof q.id).toBe("string");
      expect(typeof q.question).toBe("string");
      expect(Array.isArray(q.options)).toBe(true);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
    }
  }
}

describe("Agent 2 LLM integration: ASK_USER (structured questions)", () => {
  it(
    "emits ask_user questions for a vague video request",
    async () => {
      const { events, finalContent } = await runPipeline(
        "I want to create a video"
      );

      assertThinkEvent(events);

      // The LLM should ask clarifying questions via ASK_USER
      assertAskUserEvent(events);
      assertAskUserFinalContent(finalContent);

      // Should NOT have both suggestions and ask_user (mutually exclusive)
      const suggPart = finalContent.find((p) => p.type === "suggestions");
      const askPart = finalContent.find((p) => p.type === "agent_ask_user");
      if (askPart) {
        expect(suggPart).toBeUndefined();
      }
    },
    LLM_TIMEOUT
  );

  it(
    "ask_user questions have valid structure with id, question, and options",
    async () => {
      const { finalContent } = await runPipeline(
        "Make me a video"
      );

      const askPart = finalContent.find((p) => p.type === "agent_ask_user");
      expect(askPart).toBeDefined();
      if (askPart?.type === "agent_ask_user") {
        for (const q of askPart.questions) {
          expect(typeof q.id).toBe("string");
          expect(q.id.length).toBeGreaterThan(0);
          expect(typeof q.question).toBe("string");
          expect(q.question.length).toBeGreaterThan(0);
          expect(Array.isArray(q.options)).toBe(true);
          expect(q.options.length).toBeGreaterThanOrEqual(2);
          expect(q.options.length).toBeLessThanOrEqual(4);
          for (const opt of q.options) {
            expect(typeof opt).toBe("string");
            expect(opt.length).toBeGreaterThan(0);
          }
        }
      }
    },
    LLM_TIMEOUT
  );
});
