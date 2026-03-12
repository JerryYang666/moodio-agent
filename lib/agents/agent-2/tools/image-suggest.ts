import { ToolDefinition } from "./types";

export const imageSuggestTool: ToolDefinition = {
  name: "image_suggest",
  tag: "JSON",
  description: "Image generation suggestion with title, aspect ratio, and prompt",
  instruction: `If you are providing suggestions, output them one by one.
Wrap each suggestion in <JSON>...</JSON> tags.
Inside <JSON>, provide a JSON object with "title", "aspectRatio", and "prompt".
Do NOT output markdown code blocks. Just the raw tags.

**If the user's input contains one or more URLs, you should keep ALL of them AS IS in the prompt.**

**The image generation model you are invoking has the ability to browse the web and perform both Google text searches and Google image searches. Therefore, if a user's request depends on real-time information—such as current weather conditions or data outside your existing knowledge—you should explicitly instruct the model, within the image generation prompt, to perform Google searches to retrieve up-to-date information. When the request involves visual references—such as a specific person's appearance, a landmark, a product, or any subject where seeing an example would help—you should specifically instruct the model to perform a Google image search for that subject.**`,
  examples: [
    `<JSON>{"title": "Short title for suggestion 1", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 1"}</JSON>`,
    `<JSON>{"title": "Short title for suggestion 2", "aspectRatio": "16:9", "prompt": "Detailed image generation prompt for suggestion 2"}</JSON>`,
  ],
  waitForOutput: false,
  // parseContent uses default JSON.parse (no custom parser needed)
  // createPart is handled by the stream loop since image_suggest needs async image generation
};
