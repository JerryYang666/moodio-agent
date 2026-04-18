import { ToolDefinition } from "./types";

export const searchTool: ToolDefinition = {
  name: "search",
  tag: "SEARCH",
  description: "Content library search with text query and taxonomy filter IDs",
  instruction: `After the system injects the taxonomy tree into the conversation, you can then formulate a search query using the <SEARCH> tag:
<SEARCH>{"text": "very concise descriptive text search query", "filters": [42]}</SEARCH>

Where:
- "text": A very concise natural language text search query describing what to look for (can be empty string if only using filters). If it would help match library phrasing or improve recall, you may add a few synonyms or close alternatives in the same query. Don't add synonyms if the user's query is specific.
- "filters": An array of taxonomy value IDs from the tree (can be empty array if only using text search). Maximum of 1 taxonomy label IDs allowed.

Don't use text and filters together unless the user explicitly asks for it. Leave text an empty string if you are using filters, and leave filters an empty array if you are using text.

The search will be executed directly — no user confirmation is needed.

In your <TEXT> response, you should:
1. Explain what you are searching for and why.
2. Reference taxonomy items as markdown links: [Exact Label Name](taxonomy:ID). For example: [Dolly Zoom](taxonomy:42). The link text MUST be the exact name from the taxonomy tree, and the URL MUST be taxonomy: followed by the numeric ID. These will render as clickable chips the user can click to add that filter to their search.
3. Provide additional suggestions — both plain text search ideas and additional taxonomy labels (as links) that the user might find useful beyond what you included in the <SEARCH> block.

Rules for content search:
1. When the user asks about finding content, searching, exploring moods, techniques, shot types, or anything related to browsing the library, FIRST use <TOOL_CALL> to get the taxonomy tree.
2. After receiving the taxonomy tree, formulate your search with <SEARCH> and explain it in <TEXT>.
3. Do NOT output <SEARCH> alongside <IMAGE> (image suggestions) or <VIDEO> (video creation). Search is a separate action.
4. Do NOT output <SEARCH> without first having received the taxonomy tree via <TOOL_CALL>.
5. You MUST also include a <TEXT> response when outputting <SEARCH>.
6. You may reference taxonomy labels as [Name](taxonomy:ID) links in <TEXT> even without a <SEARCH> block, as additional suggestions.`,
  examples: [
    `<SEARCH>{"text": "man walking down the street tense mood", "filters": [42]}</SEARCH>`,
  ],
  waitForOutput: false,
  createPart: (parsed: any) => ({
    type: "agent_search" as const,
    query: {
      textSearch: typeof parsed.text === "string" ? parsed.text : "",
      filterIds: Array.isArray(parsed.filters) ? parsed.filters : [],
    },
    status: "pending" as const,
  }),
};
