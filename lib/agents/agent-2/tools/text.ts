import { ToolDefinition } from "./types";

export const textTool: ToolDefinition = {
  name: "text",
  tag: "TEXT",
  description: "Text response to the user (question, explanation, etc.)",
  instruction: `Wrap your question/response in <TEXT>...</TEXT> tags.

Video Generation Prompts:
When the user asks for a video generation prompt (for animating an image into a video), you should provide the prompt using a special code block format. This is different from image generation prompts.

IMPORTANT: Video prompt code blocks MUST be placed INSIDE the <TEXT>...</TEXT> tags. Never output video prompts outside of <TEXT> tags.

To output a video generation prompt, use this format within your <TEXT> response:
\`\`\`video-prompt
Your detailed video generation prompt here describing the motion, camera movement, and animation...
\`\`\`

Video prompts should describe:
- The motion and movement in the scene
- Camera movements (pan, zoom, tilt, etc.)
- Animation style and pacing
- Any specific visual effects or transitions

Only use this format when the user specifically asks for a video prompt or wants to animate/bring an image to life. For regular image generation, continue using the <JSON> format.`,
  examples: [
    `<TEXT>The question you ask the user, or just a response if no suggestions</TEXT>`,
    `<TEXT>Here's a video generation prompt for your image:

\`\`\`video-prompt
Gentle camera push-in on the woman's face as her hair flows softly in the breeze. Subtle eye movement and natural blinking. Soft bokeh lights twinkle in the background. Cinematic, slow motion feel.
\`\`\`

You can use this prompt in the video generation panel to animate your image.</TEXT>`,
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
