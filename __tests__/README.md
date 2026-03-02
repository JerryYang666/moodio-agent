# Agent 1 Structured Output Parsing Tests

Automated test suite for Agent 1's XML-based structured output schemas and the parsing logic that processes them.

## What's being tested

Agent 1 instructs the LLM to produce responses wrapped in XML tags (`<TEXT>`, `<JSON>`, `<VIDEO>`, etc.). Our parsing pipeline validates the tag structure, extracts content from each tag, and converts it into typed `MessageContentPart` objects for the frontend. These tests verify that pipeline across three layers:

1. **Unit tests** — fixed inputs, deterministic, test each parser function in isolation
2. **Streaming simulation** — simulates chunked delivery (like the real LLM stream), tests incremental parsing and malformed-schema detection mid-stream
3. **Real LLM integration** — calls the actual LLM with Agent 1's real system prompt, runs the response through the real production parsing pipeline, and fails if the output doesn't conform

The pure parsing functions live in `lib/agents/parse-agent-output.ts`, extracted from `lib/agents/agent-1.ts`.

## Test files

### Unit tests (deterministic, no network)

| File | Schema | What it covers |
|---|---|---|
| `validate-buffer-tags.test.ts` | Tag validation | Ensures no non-whitespace text appears outside known XML tags |
| `extract-tag.test.ts` | Tag extraction | Low-level `<TAG>…</TAG>` content extraction and remainder handling |
| `parse-text.test.ts` | `<TEXT>` | User-facing response text (question / explanation) |
| `parse-suggestions.test.ts` | `<JSON>` | Image suggestions with `title`, `aspectRatio`, `prompt`; 8-suggestion cap |
| `parse-video.test.ts` | `<VIDEO>` | Video generation config (`modelId`, `prompt`, `sourceImageId`, params) |
| `parse-shot-list.test.ts` | `<SHOTLIST>` | Tabular shot list data (`title`, `columns`, `rows`) |
| `parse-search.test.ts` | `<SEARCH>` | Content search queries (`text`, `filters` → `textSearch`, `filterIds`) |
| `parse-tool-call.test.ts` | `<TOOL_CALL>` | Tool invocations (currently `CHECK_TAXONOMY` with `lang`) |
| `parse-thought.test.ts` | `<think>` | Internal chain-of-thought reasoning (admin-only) |
| `parse-full-output.test.ts` | Multi-tag | Integration tests combining multiple schemas in a single LLM response |

### Streaming simulation (deterministic, no network)

| File | What it covers |
|---|---|
| `streaming-simulation.test.ts` | Feeds chunks incrementally through the parser (like `consumeLLMStream`). Tests that valid schemas are detected only after closing tags arrive, and that malformed schemas (bare text between tags, invalid JSON mid-stream) are caught during streaming. |

### Real LLM integration (requires `LLM_API_KEY`, hits network)

| File | What it covers |
|---|---|
| `llm-integration.test.ts` | Calls gpt-5.2 with Agent 1's real system prompt and runs the response through the real production `parseFullOutput` pipeline. Tests that the LLM produces valid `<think>`, `<TEXT>`, `<JSON>`, `<SHOTLIST>`, and `<TOOL_CALL>` output for various user prompts. **On failure, prints the raw LLM output to console for human inspection.** |

## Running

```bash
# All tests (unit + streaming + LLM integration)
npm test

# Watch mode
npm run test:watch

# Only fast unit + streaming tests (no LLM calls)
npx vitest run --exclude '**/llm-integration*'

# Only LLM integration tests
npx vitest run __tests__/llm-integration.test.ts
```

## Interpreting LLM integration failures

LLM integration tests are non-deterministic by nature. When a test fails:

1. The **raw LLM output** is printed to stderr — inspect it to see exactly what the model produced.
2. Common failure modes:
   - **Trailing characters inside `<JSON>` tags** (e.g. `}}`): the LLM adds extra braces after the JSON object. This causes `JSON.parse` to fail, and in production would trigger a retry.
   - **Missing tags**: the LLM omits `<SHOTLIST>` and generates image suggestions instead.
   - **Text outside tags**: the LLM puts bare text between `</TEXT>` and the next `<JSON>`.
3. These failures are **real findings** about LLM compliance with the schema, not test bugs.

## Adding new tests

1. Create a new `.test.ts` file in this folder.
2. Import helpers from `@/lib/agents/parse-agent-output`.
3. Use `createParseState(buffer)` to set up initial state and a `ParseEvent[]` array to collect emitted events.
4. Call the relevant parse function and assert on events, `state.finalContent`, and `state.buffer`.

If a new XML tag is added to Agent 1, add it to `VALID_TAGS` in `parse-agent-output.ts`, write a corresponding parse function, and create a test file here.
