import { ToolDefinition } from "./types";

export const askUserTool: ToolDefinition = {
  name: "ask_user",
  tag: "ASK_USER",
  description:
    "Present structured multiple-choice questions to the user when you need clarification",
  instruction: `When you need to ask the user a clarifying question and the answer can be expressed as a choice among a few options, use <ASK_USER> instead of asking in plain text. Emit a JSON array of question objects.

Each question object has:
- "id": A unique identifier string for the question (e.g. "q1", "purpose", "duration")
- "question": The question text, written conversationally
- "options": An array of 2-4 short answer strings the user can pick from

Rules:
- Maximum 3 questions per <ASK_USER> block
- Each question must have 2-4 options
- Options should be concise (1-6 words each) and cover the most likely answers
- The user always has the option to type a custom answer, so you don't need an "Other" option
- NEVER use both <ASK_USER> and <SUGGESTIONS> in the same response — pick one. Use <ASK_USER> when you need input before proceeding; use <SUGGESTIONS> when you've already completed your response and are offering follow-up actions.

CRITICAL: You MUST always include the closing </ASK_USER> tag. Never leave an <ASK_USER> tag unclosed.`,
  examples: [
    `<ASK_USER>[{"id":"purpose","question":"What is this video for?","options":["Social media ad","Product demo","Music video","Short film"]},{"id":"duration","question":"How long should it be?","options":["5 seconds","15 seconds","30 seconds","60 seconds"]}]</ASK_USER>`,
    `<ASK_USER>[{"id":"style","question":"Which visual style do you prefer?","options":["Cinematic & dramatic","Bright & colorful","Minimalist & clean"]}]</ASK_USER>`,
  ],
  waitForOutput: false,
  maxOccurrences: 1,
  parseContent: (
    raw: string
  ): Array<{ id: string; question: string; options: string[] }> => {
    const trimmed = raw.trim();
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item: any) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string" &&
          typeof item.question === "string" &&
          Array.isArray(item.options) &&
          item.options.length >= 2 &&
          item.options.every((o: any) => typeof o === "string")
      )
      .slice(0, 3)
      .map((item: any) => ({
        id: item.id,
        question: item.question,
        options: item.options.slice(0, 4),
      }));
  },
  createPart: (parsed: any) => ({
    type: "agent_ask_user" as const,
    questions: parsed,
  }),
};
