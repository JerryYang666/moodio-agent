import { ToolDefinition } from "./types";
import { generateImageId } from "@/lib/storage/s3";
import { siteConfig } from "@/config/site";

const MAX_SUGGESTIONS = siteConfig.imageLimits.maxSuggestionsHardCap;
const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
];

export const imageSuggestTool: ToolDefinition = {
  name: "image_suggest",
  tag: "IMAGE",
  description: "Use image to inspire video. Generates first-frame images paired with video ideas. Also used for standalone image generation suggestions.",
  instruction: `This tool serves TWO purposes. Determine which purpose to use based on the user's intent:

**PURPOSE 1: Video Idea Suggestions (default)**
Use this when the user wants video ideas, video concepts, video suggestions, or asks something like "give me video ideas", "suggest some videos", "what videos should I make", etc. This is the default purpose — use it unless the user explicitly asks for static image generation.

**PURPOSE 2: Image Suggestions**
Use this when the user explicitly wants image generation ideas, image edits, or any visual content that is NOT video.

SHARED RULES (apply to BOTH purposes):
- You must give exactly four suggestions unless the user explicitly asks for fewer or more.
- You must give exactly four suggestions unless the user explicitly asks for fewer or more.
- You must give exactly four suggestions unless the user explicitly asks for fewer or more.
- The absolute maximum number of suggestions you can give is ${MAX_SUGGESTIONS}. If the user asks for more than ${MAX_SUGGESTIONS}, you should give ${MAX_SUGGESTIONS} suggestions.
- For each suggestion, wrap it in <IMAGE>...</IMAGE> tags with a JSON object.
- Do NOT output markdown code blocks. Just the raw tags.
- For each suggestion, choose an appropriate aspect ratio from: ${SUPPORTED_ASPECT_RATIOS.join(", ")}
  - Use "1:1" for square/profile images
  - Use "16:9" for wide landscape/cinematic scenes
  - Use "9:16" for tall portrait/mobile content
  - Use "3:2" or "2:3" for standard photography
  - Use "21:9" for ultra-wide cinematic scenes
  Choose the most appropriate ratio based on the subject matter and composition.

**If the user's input contains one or more URLs, you should keep ALL of them AS IS in the prompt.**

**The image generation model you are invoking has the ability to browse the web and perform both Google text searches and Google image searches. Therefore, if a user's request depends on real-time information—such as current weather conditions or data outside your existing knowledge—you should explicitly instruct the model, within the image generation prompt, to perform Google searches to retrieve up-to-date information. When the request involves visual references—such as a specific person's appearance, a landmark, a product, or any subject where seeing an example would help—you should specifically instruct the model to perform a Google image search for that subject.**

PURPOSE 1 SPECIFIC RULES (Video Idea Suggestions):
- Output ALL <IMAGE> tags first, then a single <TEXT> tag at the end.
- Each <IMAGE> tag represents the **first frame / thumbnail** of a proposed video. The JSON object must contain "title", "aspectRatio", and "prompt".
  - "prompt": A detailed image generation prompt for the first frame / opening shot of the video. This should be a static, visually striking image that sets the scene for the video.
- After all <IMAGE> tags, output exactly ONE <TEXT> tag that describes the video idea for every suggestion — what happens in each video, the motion, transitions, story arc, mood, and camera movements.
- The output order must be: introductory <TEXT>, then all 4 <IMAGE> tags, then one final <TEXT> with all video idea descriptions.
- The aspect ratio for video first frames should typically be "16:9" or "9:16" depending on the intended video format, unless the user specifies otherwise.

PURPOSE 2 SPECIFIC RULES (Image Suggestions):
- The JSON object must contain "title", "aspectRatio", "prompt", and optionally "referenceImageIds".
- referenceImageIds (optional): An array of Image IDs from the conversation to use as reference images for editing. Use this when the user asks you to modify or build upon a previously generated or uploaded image from earlier in the conversation.
- If the user's input includes an image, make sure your prompts are editing prompts referring to an edit of the image. For example, "Change the man in the image's shirt to red...".
- If the user's input does not contain an image, make sure your prompts are image generation prompts.
- Always output a <TEXT> response before your <IMAGE> suggestions that briefly introduces them. Never output an <IMAGE> tag without a preceding <TEXT> introduction.
For example, if the user said "I want to create an image of two couples kissing", you can ask "Where are these two couples kissing?" and provide suggestions like "In a classroom", "In a playground", etc.`,
  examples: [
    `<IMAGE>{"title": "Sunset Beach Walk", "aspectRatio": "16:9", "prompt": "A cinematic wide shot of a couple standing at the edge of a golden sandy beach at sunset, waves gently lapping at their feet, warm golden hour light casting long shadows, the sky painted in oranges and purples, shot from behind them looking out at the horizon"}</IMAGE>
<IMAGE>{"title": "City Rooftop Dance", "aspectRatio": "9:16", "prompt": "A stylish couple on a dimly lit rooftop at night, city skyline glowing behind them, string lights draped overhead, the woman mid-spin in a flowing red dress, motion blur on the dress hem, moody cinematic lighting"}</IMAGE>
<IMAGE>{"title": "Forest Morning Jog", "aspectRatio": "16:9", "prompt": "A lone runner on a misty forest trail at dawn, sunbeams breaking through tall pine trees, dew on fern leaves, the runner captured mid-stride from a low angle, soft golden light illuminating dust particles in the air"}</IMAGE>
<IMAGE>{"title": "Underwater Coral Dive", "aspectRatio": "16:9", "prompt": "A scuba diver hovering above a vibrant coral reef, schools of colorful tropical fish swimming around, crystal clear turquoise water, sunlight rays piercing down from the surface, wide-angle underwater photography style"}</IMAGE>
<TEXT>1. **Sunset Beach Walk** — The video opens on the couple standing still at the shore. The camera slowly dollies forward as they begin to walk hand-in-hand along the waterline. Gentle waves wash over their feet. The camera arcs to a side profile as the sun dips lower, ending with a silhouette shot against the vibrant sunset sky.
2. **City Rooftop Dance** — Opens on a wide shot of the skyline, then pulls focus to the couple. She begins to spin as music fades in. The camera orbits them in a slow 360, capturing the flowing dress and twinkling city lights. Ends with a close-up of their hands clasping.
3. **Forest Morning Jog** — Starts with a macro shot of dew dripping off a leaf, then cuts to the runner entering frame. The camera tracks alongside at pace, weaving between trees. Gradually the mist lifts and the forest brightens, ending with a drone pullback revealing the full trail.
4. **Underwater Coral Dive** — Opens with a surface splash as the diver enters the water. The camera follows them descending through shafts of sunlight. Fish scatter and regroup as the diver glides over the reef. Ends with a slow upward tilt toward the shimmering surface.</TEXT>`,
    `<IMAGE>{"title": "Short title for suggestion 1", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 1"}</IMAGE>`,
    `<IMAGE>{"title": "Short title for suggestion 2", "aspectRatio": "16:9", "prompt": "Detailed image generation prompt for suggestion 2"}</IMAGE>`,
    `<IMAGE>{"title": "Edit of previous image", "aspectRatio": "1:1", "prompt": "Editing prompt describing changes to make", "referenceImageIds": ["abc123"]}</IMAGE>`,
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
