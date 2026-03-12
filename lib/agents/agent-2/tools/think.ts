import { ToolDefinition } from "./types";

export const thinkTool: ToolDefinition = {
  name: "think",
  tag: "think",
  description: "Internal thinking process for analyzing user needs",
  instruction: `Before responding, you MUST provide a thinking block wrapped in <think>...</think> tags. This block should contain the following sections:
1. belief_prompt: Your internal estimate of what the user currently wants, summarized from the most recent user click (or no-click) and message.
2. user_intention (immediate goal): Your analysis and prediction of what the user would like in the next round.
3. user_preference (short-term goal): A list of textual statements describing the user's preferences or dislikes within this session.
4. user_persona (long-term goal): High-level, persistent user preferences collected across previous rounds.`,
  examples: [
    `<think>
belief_prompt: User wants to create a romantic scene...
user_intention: User likely wants to refine the setting...
user_preference: - Likes realistic style...
user_persona: Romantic, detail-oriented...
</think>`,
  ],
  waitForOutput: false,
  parseContent: (raw: string) => raw.trim(),
  createPart: (parsed: any) => ({
    type: "internal_think" as const,
    text: parsed as string,
  }),
};
