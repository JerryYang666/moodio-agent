# Agent 2 — Modular Creative Assistant

Agent 2 is a modular refactor of the monolithic Agent 1. It separates concerns into:

- **ToolDefinition** — declarative tool descriptions (prompt, parsing, output handling)
- **ToolRegistry** — central registry all components read from
- **StreamLoop** — generic stream consumer (zero tool-specific code)
- **SystemPromptConstructor** — builds the prompt dynamically from the registry
- **ToolExecutor + Handlers** — execution layer for tools that need server-side work

## How to add a new tool

### 1. Create a tool definition

Create a new file in `lib/agents/agent-2/tools/` (e.g. `my-tool.ts`):

```typescript
import { ToolDefinition } from "./types";

export const myTool: ToolDefinition = {
  name: "my_tool",
  tag: "MYTOOL",             // XML tag the LLM will use: <MYTOOL>...</MYTOOL>
  description: "Short description",
  instruction: `Instructions for the LLM on when and how to use this tool...`,
  examples: [
    `<MYTOOL>{"key": "value"}</MYTOOL>`,
  ],
  waitForOutput: false,       // see "Execution modes" below
};
```

### 2. Register it

In `lib/agents/agent-2/index.ts`, import and register:

```typescript
import { myTool } from "./tools/my-tool";

// inside Agent2 constructor:
this.registry.register(myTool);
```

That's it for passive tools. The system prompt, output parser, and stream loop
all pick up the new tool automatically from the registry.

### 3. (Optional) Add a handler

If your tool needs server-side execution (API calls, DB writes, etc.), create
a handler in `lib/agents/agent-2/executor/handlers/`:

```typescript
import { ToolHandler, ToolResult } from "../tool-executor";
import { ParsedTag } from "../../core/output-parser";
import { RequestContext } from "../../context";

export class MyToolHandler implements ToolHandler {
  async execute(parsedTag: ParsedTag, ctx: RequestContext): Promise<ToolResult> {
    // Do work...
    return { success: true, data: { /* result */ } };
  }
}
```

Register it in `Agent2.createToolExecutor()`:

```typescript
executor.registerHandler("my_tool", new MyToolHandler());
```

## Execution modes

Set these fields on `ToolDefinition` to control how the StreamLoop handles your tool:

| Mode | Fields | Behavior |
|------|--------|----------|
| **Passive** | `waitForOutput: false` | StreamLoop calls `createPart` → emits event → done. No handler needed. |
| **Fire-and-forget** | `waitForOutput: false, fireAndForget: true` | StreamLoop creates placeholder via `createPart`, then runs the handler in the background. Handler sends `part_update` events as it progresses. |
| **Wait-for-output** | `waitForOutput: true` | StreamLoop pauses the LLM stream, executes the handler, injects the result back into the conversation via `buildContinuationMessage`, and starts a new LLM stream. |

## Key ToolDefinition fields

| Field | Purpose |
|-------|---------|
| `name` / `tag` | Identity: tool name and XML tag |
| `instruction` | Injected into the system prompt |
| `examples` | Appended after instruction in the prompt |
| `dynamicPromptData` | Function returning runtime data for the prompt (e.g. model lists) |
| `parseContent` | Custom parser for raw tag content (default: `JSON.parse`) |
| `createPart` | Converts parsed content into a `MessageContentPart` for `finalContent` |
| `createEvent` | Custom SSE event creation (default: `{ type: "part", part }`) |
| `onOpenTag` | Callback when the opening tag is detected (before closing tag) |
| `maxOccurrences` | Caps how many times this tag is processed per request |
| `buildContinuationMessage` | For `waitForOutput` tools: builds the user message to inject the result |

## Architecture diagram

```
                    ┌──────────────┐
                    │  ToolRegistry │
                    └──────┬───────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
  SystemPromptConstructor  OutputParser   ToolExecutor
           │               │               │
           ▼               ▼               ▼
     system prompt    parsed tags     tool results
           │               │               │
           └───────► StreamLoop ◄──────────┘
                       │
                       ▼
                  SSE events → frontend
```
