import { ToolDefinition } from "./types";

const ALLOWED_ICONS = [
  "ImagePlus", "Clapperboard", "Gamepad2", "Package", "Layout", "Film",
  "GraduationCap", "Search", "Wand2", "RefreshCw", "Palette", "Sparkles",
  "Layers", "Pencil", "Zap", "Eye", "ArrowRight", "Video", "Type",
  "Lightbulb", "Brush",
];

export const suggestionsTool: ToolDefinition = {
  name: "suggestions",
  tag: "SUGGESTIONS",
  description:
    "Contextual follow-up action suggestions shown to the user after your response",
  instruction: `After completing your response (after </TEXT> and any image/video tags), you may optionally emit a <SUGGESTIONS> tag containing a JSON array of 0-3 contextual follow-up actions the user might want to take next.

Each suggestion object has:
- "label": Short button text (max 5 words) describing the action
- "icon": One of the allowed icon names: ${ALLOWED_ICONS.join(", ")}
- "promptText": The follow-up prompt text that will be inserted into the input when clicked. Should be a natural continuation prompt.

Rules:
- Only suggest genuinely useful and contextually relevant next steps
- If there is no good follow-up action, skip the <SUGGESTIONS> tag entirely or emit an empty array
- Maximum 3 suggestions
- Suggestions should be diverse — offer different directions the user could take
- The promptText should be specific enough to be useful but open enough for the user to customize
- NEVER use both <SUGGESTIONS> and <ASK_USER> in the same response — pick one. Use <SUGGESTIONS> when you've already completed your response and are offering follow-up actions; use <ASK_USER> when you need clarification before proceeding.

IMPORTANT: When you use <SUGGESTIONS> immediately after using <VIDEO_SUGGEST> (i.e. you just suggested video ideas), you MUST suggest exactly these three actions:
1. "Create a video" (icon: "Video", promptText: "Let's create a video from one of these ideas ")
2. "Generate a shot list" (icon: "Clapperboard", promptText: "Generate a shot list for these video ideas ")
3. "More ideas" (icon: "Lightbulb", promptText: "Give me more video ideas ")

CRITICAL: You MUST always include the closing </SUGGESTIONS> tag. Never leave a <SUGGESTIONS> tag unclosed.`,
  examples: [
    `<SUGGESTIONS>[{"label":"Try different style","icon":"Palette","promptText":"Recreate this with a watercolor painting style "},{"label":"Generate variations","icon":"RefreshCw","promptText":"Generate 4 variations of the same concept with different compositions "},{"label":"Create a video","icon":"Video","promptText":"Turn this into a short animated video "}]</SUGGESTIONS>`,
    `<SUGGESTIONS>[{"label":"Refine the details","icon":"Pencil","promptText":"Refine the image with more detailed "},{"label":"Change aspect ratio","icon":"Layers","promptText":"Recreate this in a 9:16 portrait format "}]</SUGGESTIONS>`,
    `<SUGGESTIONS>[]</SUGGESTIONS>`,
  ],
  waitForOutput: false,
  maxOccurrences: 1,
  parseContent: (raw: string): Array<{ label: string; icon?: string; promptText: string }> => {
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
          typeof item.label === "string" &&
          typeof item.promptText === "string"
      )
      .slice(0, 3)
      .map((item: any) => ({
        label: item.label,
        icon: typeof item.icon === "string" ? item.icon : undefined,
        promptText: item.promptText,
      }));
  },
  createPart: (parsed: any) => ({
    type: "suggestions" as const,
    suggestions: parsed,
  }),
};
