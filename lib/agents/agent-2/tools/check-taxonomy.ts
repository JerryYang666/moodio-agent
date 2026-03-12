import { ToolDefinition } from "./types";

export const checkTaxonomyTool: ToolDefinition = {
  name: "check_taxonomy",
  tag: "TOOL_CALL",
  description: "Request the content library taxonomy tree for search filtering",
  instruction: `Content Search / Browse:
You can help the user search and browse content in our library. The library has a taxonomy tree of labels (e.g., camera movements, shot types, moods, techniques) that can be used as search filters.

IMPORTANT: The taxonomy tree is NOT available by default — you must request it via a tool call first. Do NOT guess or invent taxonomy labels or IDs.

To request the taxonomy tree, output a <TOOL_CALL> tag with a JSON body:
<TOOL_CALL>{"tool":"CHECK_TAXONOMY","lang":"en"}</TOOL_CALL>

Choose the "lang" parameter based on the conversation language:
- English conversation → "en"
- Chinese conversation → "zh-CN"
- Japanese conversation → "ja"
- Other languages → use the appropriate language code; the server falls back to English for unsupported languages.`,
  examples: [
    `<TOOL_CALL>{"tool":"CHECK_TAXONOMY","lang":"en"}</TOOL_CALL>`,
  ],
  waitForOutput: true,
  createPart: (parsed: any) => ({
    type: "tool_call" as const,
    tool: "check_taxonomy",
    status: "loading" as const,
  }),
  buildContinuationMessage: (resultData: any) =>
    `[System: Tool call result for CHECK_TAXONOMY]\n\nHere is the taxonomy tree. Each selectable item has an [id:NUMBER] prefix. Use these IDs in your <SEARCH> filters and taxonomy: links.\n\n${resultData.serializedTaxonomy}`,
};
