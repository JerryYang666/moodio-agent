import { ToolDefinition } from "./types";

export const textTool: ToolDefinition = {
  name: "text",
  tag: "TEXT",
  description: "Text response to the user (question, answer, explanation, etc.)",
  instruction: `Wrap your response in <TEXT>...</TEXT> tags.

CRITICAL: You MUST always include the closing </TEXT> tag. Never leave a <TEXT> tag unclosed.
You MUST always include the closing </TEXT> tag. Never leave a <TEXT> tag unclosed. You MUST always include the closing </TEXT> tag. Never leave a <TEXT> tag unclosed.`,
  examples: [
    `<TEXT>Here is my response to the user.</TEXT>`,
  ],
  waitForOutput: false,
  maxOccurrences: 1,
  parseContent: (raw: string) => raw.trim(),
  createPart: (parsed: any) => ({
    type: "text" as const,
    text: parsed as string,
  }),
  createEvent: (part) =>
    part?.type === "text"
      ? { type: "text", content: (part as any).text }
      : null,
};
