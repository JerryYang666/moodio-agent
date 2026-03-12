import { ToolDefinition } from "./types";
import { generateImageId } from "@/lib/storage/s3";
import { siteConfig } from "@/config/site";

const MAX_SUGGESTIONS = siteConfig.imageLimits.maxSuggestionsHardCap;
const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
];

export const imageSuggestTool: ToolDefinition = {
  name: "image_suggest",
  tag: "JSON",
  description: "Image generation suggestion with title, aspect ratio, and prompt",
  instruction: `Image Suggestion Rules:
You must give exactly four suggestions unless the user explicitly asks for fewer or more.
You must give exactly four suggestions unless the user explicitly asks for fewer or more.
You must give exactly four suggestions unless the user explicitly asks for fewer or more.
The absolute maximum number of suggestions you can give is ${MAX_SUGGESTIONS}. If the user asks for more than ${MAX_SUGGESTIONS}, you should give ${MAX_SUGGESTIONS} suggestions.

For example, if the user said "I want to create an image of two couples kissing", you can ask "Where are these two couples kissing?" and provide suggestions like "In a classroom", "In a playground", etc.

If the user's input is too short or not conducive to suggestions (e.g., just "Hi"), you can choose not to provide any suggestions.
If the user's input includes an image, you should make sure your prompts are editing prompts that are referring to an edit of the image. For example, "Change the man in the image's shirt to red...".
If the user's input does not contain an image, make sure your prompts are image generation prompts.

For each suggestion, wrap it in <JSON>...</JSON> tags with a JSON object containing "title", "aspectRatio", and "prompt".
Do NOT output markdown code blocks. Just the raw tags.

For each suggestion, choose an appropriate aspect ratio from: ${SUPPORTED_ASPECT_RATIOS.join(", ")}
- Use "1:1" for square/profile images
- Use "16:9" for wide landscape/cinematic scenes
- Use "9:16" for tall portrait/mobile content
- Use "3:2" or "2:3" for standard photography
- Use "21:9" for ultra-wide cinematic scenes
Choose the most appropriate ratio based on the subject matter and composition.

**If the user's input contains one or more URLs, you should keep ALL of them AS IS in the prompt.**

**The image generation model you are invoking has the ability to browse the web and perform both Google text searches and Google image searches. Therefore, if a user's request depends on real-time information—such as current weather conditions or data outside your existing knowledge—you should explicitly instruct the model, within the image generation prompt, to perform Google searches to retrieve up-to-date information. When the request involves visual references—such as a specific person's appearance, a landmark, a product, or any subject where seeing an example would help—you should specifically instruct the model to perform a Google image search for that subject.**`,
  examples: [
    `<JSON>{"title": "Short title for suggestion 1", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 1"}</JSON>`,
    `<JSON>{"title": "Short title for suggestion 2", "aspectRatio": "16:9", "prompt": "Detailed image generation prompt for suggestion 2"}</JSON>`,
  ],
  waitForOutput: false,
  fireAndForget: true,
  createPart: (parsed: any) => ({
    type: "agent_image" as const,
    imageId: generateImageId(),
    title: "Loading...",
    aspectRatio: parsed.aspectRatio,
    prompt: parsed.prompt,
    status: "loading" as const,
  }),
};
