/**
 * Pure parsing functions for Agent 1 structured output.
 *
 * Extracted from agent-1.ts so they can be unit-tested without
 * LLM calls, image generation, or any other side effects.
 */

import { MessageContentPart } from "@/lib/llm/types";

export const VALID_TAGS = [
  "TEXT",
  "JSON",
  "VIDEO",
  "SHOTLIST",
  "TOOL_CALL",
  "SEARCH",
  "think",
] as const;

export type ValidTag = (typeof VALID_TAGS)[number];

// ---------- low-level helpers ----------

/**
 * Validate that no non-whitespace text appears outside known XML tags.
 * Throws if invalid content is found.
 */
export function validateBufferTags(buffer: string): void {
  let insideTag = false;
  let inAngleBrackets = false;
  let i = 0;

  while (i < buffer.length) {
    const remaining = buffer.substring(i);

    let tagMatched = false;
    for (const tag of VALID_TAGS) {
      const open = `<${tag}>`;
      const close = `</${tag}>`;
      if (remaining.startsWith(open)) {
        insideTag = true;
        i += open.length;
        tagMatched = true;
        break;
      }
      if (remaining.startsWith(close)) {
        insideTag = false;
        i += close.length;
        tagMatched = true;
        break;
      }
    }
    if (tagMatched) continue;

    const char = buffer[i];
    if (char === "<") {
      inAngleBrackets = true;
    } else if (char === ">") {
      inAngleBrackets = false;
    } else if (!insideTag && !inAngleBrackets && char.trim() !== "") {
      throw new Error(
        `Invalid LLM response: text outside tags at position ${i}`
      );
    }

    i++;
  }
}

/**
 * Extract content between an XML open/close tag pair from the buffer.
 * Returns { content, rest } if found, or null if the closing tag isn't present yet.
 */
export function extractTag(
  buffer: string,
  tag: string
): { content: string; rest: string } | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = buffer.indexOf(open);
  const end = buffer.indexOf(close);
  if (start === -1 || end === -1 || start >= end) return null;
  const content = buffer.substring(start + open.length, end);
  const rest = buffer.substring(end + close.length);
  return { content, rest };
}

// ---------- Parse state / context (subset needed for pure parsing) ----------

export interface ParseState {
  buffer: string;
  fullLlmResponse: string;
  thoughtSent: boolean;
  questionSent: boolean;
  suggestionIndex: number;
  shotListStartSent: boolean;
  finalContent: MessageContentPart[];
}

export function createParseState(initialBuffer?: string): ParseState {
  return {
    buffer: initialBuffer ?? "",
    fullLlmResponse: initialBuffer ?? "",
    thoughtSent: false,
    questionSent: false,
    suggestionIndex: 0,
    shotListStartSent: false,
    finalContent: [],
  };
}

/** Collected events emitted by the parse helpers. */
export interface ParseEvent {
  type: string;
  [key: string]: any;
}

// ---------- individual parse functions ----------

export function parseThought(
  state: ParseState,
  events: ParseEvent[]
): void {
  if (state.thoughtSent) return;
  const result = extractTag(state.buffer, "think");
  if (!result) return;

  const thoughtText = result.content.trim();
  events.push({ type: "internal_think", content: thoughtText });
  state.finalContent.push({ type: "internal_think", text: thoughtText });
  state.thoughtSent = true;
  state.buffer = result.rest;
}

export function parseText(
  state: ParseState,
  events: ParseEvent[]
): void {
  if (state.questionSent) return;
  const result = extractTag(state.buffer, "TEXT");
  if (!result) return;

  const questionText = result.content.trim();
  events.push({ type: "text", content: questionText });
  state.finalContent.push({ type: "text", text: questionText });
  state.questionSent = true;
  state.buffer = result.rest;
}

/**
 * Parse one or more `<JSON>` blocks from the buffer.
 * Returns the parsed suggestion objects and emits loading placeholder events.
 * (In the real agent, each suggestion triggers image generation — here we only
 * verify that the JSON is correctly parsed and the right events are emitted.)
 */
export function parseSuggestions(
  state: ParseState,
  events: ParseEvent[]
): { title: string; aspectRatio: string; prompt: string }[] {
  const suggestions: { title: string; aspectRatio: string; prompt: string }[] =
    [];

  while (state.buffer.includes("</JSON>")) {
    const result = extractTag(state.buffer, "JSON");
    if (!result) break;

    const suggestion = JSON.parse(result.content);
    suggestions.push(suggestion);

    if (state.suggestionIndex < 8) {
      const placeholder: MessageContentPart = {
        type: "agent_image",
        imageId: `test-image-${state.suggestionIndex}`,
        title: suggestion.title ?? "Loading...",
        aspectRatio: suggestion.aspectRatio,
        prompt: suggestion.prompt,
        status: "loading",
      };
      events.push({ type: "part", part: placeholder });
      state.finalContent.push(placeholder);
      state.suggestionIndex++;
    }

    state.buffer = result.rest;
  }

  return suggestions;
}

export function parseVideo(
  state: ParseState,
  events: ParseEvent[]
): Record<string, any> | null {
  if (!state.buffer.includes("</VIDEO>")) return null;
  const result = extractTag(state.buffer, "VIDEO");
  if (!result) return null;

  const videoConfig = JSON.parse(result.content);

  const videoPart: MessageContentPart = {
    type: "agent_video",
    config: {
      modelId: videoConfig.modelId ?? "unknown",
      modelName: videoConfig.modelName ?? "Unknown",
      prompt: videoConfig.prompt ?? "",
      sourceImageId:
        typeof videoConfig.sourceImageId === "string"
          ? videoConfig.sourceImageId
          : undefined,
      params: {},
    },
    status: "pending",
  };

  events.push({ type: "part", part: videoPart });
  state.finalContent.push(videoPart);
  state.buffer = result.rest;

  return videoConfig;
}

export function parseShotList(
  state: ParseState,
  events: ParseEvent[]
): Record<string, any> | null {
  if (
    !state.shotListStartSent &&
    state.buffer.includes("<SHOTLIST>")
  ) {
    state.shotListStartSent = true;
    events.push({ type: "shot_list_start" });
  }

  if (!state.buffer.includes("</SHOTLIST>")) return null;
  const result = extractTag(state.buffer, "SHOTLIST");
  if (!result) return null;

  const shotListData = JSON.parse(result.content);
  const shotListPart: MessageContentPart = {
    type: "agent_shot_list",
    title: shotListData.title || "Shot List",
    columns: Array.isArray(shotListData.columns) ? shotListData.columns : [],
    rows: Array.isArray(shotListData.rows) ? shotListData.rows : [],
    status: "complete",
  };

  events.push({ type: "part", part: shotListPart });
  state.finalContent.push(shotListPart);
  state.buffer = result.rest;

  return shotListData;
}

export function parseSearch(
  state: ParseState,
  events: ParseEvent[]
): { textSearch: string; filterIds: number[] } | null {
  if (!state.buffer.includes("</SEARCH>")) return null;
  const result = extractTag(state.buffer, "SEARCH");
  if (!result) return null;

  const searchData = JSON.parse(result.content);
  const searchPart: MessageContentPart = {
    type: "agent_search",
    query: {
      textSearch: typeof searchData.text === "string" ? searchData.text : "",
      filterIds: Array.isArray(searchData.filters) ? searchData.filters : [],
    },
    status: "pending",
  };

  events.push({ type: "part", part: searchPart });
  state.finalContent.push(searchPart);
  state.buffer = result.rest;

  return searchPart.query;
}

export function parseToolCall(
  state: ParseState,
  events: ParseEvent[]
): { tool: string; lang: string } | null {
  if (!state.buffer.includes("</TOOL_CALL>")) return null;
  const result = extractTag(state.buffer, "TOOL_CALL");
  if (!result) return null;

  const parsed = JSON.parse(result.content.trim());
  const toolCall = {
    tool: parsed.tool as string,
    lang: typeof parsed.lang === "string" ? parsed.lang : "en",
  };

  events.push({
    type: "tool_call",
    tool: toolCall.tool.toLowerCase(),
    status: "loading",
  });
  state.finalContent.push({
    type: "tool_call",
    tool: toolCall.tool.toLowerCase(),
    status: "loading",
  });
  state.buffer = result.rest;

  return toolCall;
}

// ---------- high-level: parse a complete LLM output string ----------

/**
 * Feed a complete (or partial) LLM output through the full parsing pipeline.
 * Returns the events emitted and final content parts.
 *
 * This simulates `consumeLLMStream` but synchronously, making it easy to test
 * without real streaming infrastructure.
 */
export function parseFullOutput(rawOutput: string): {
  events: ParseEvent[];
  finalContent: MessageContentPart[];
  state: ParseState;
} {
  const state = createParseState(rawOutput);
  const events: ParseEvent[] = [];

  validateBufferTags(state.buffer);

  parseThought(state, events);
  parseText(state, events);
  parseSuggestions(state, events);
  parseVideo(state, events);
  parseShotList(state, events);
  parseSearch(state, events);
  parseToolCall(state, events);

  return { events, finalContent: state.finalContent, state };
}
