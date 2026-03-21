import { ToolDefinition } from "./types";
import { generateImageId } from "@/lib/storage/s3";
import { siteConfig } from "@/config/site";

const MAX_SUGGESTIONS = siteConfig.imageLimits.maxSuggestionsHardCap;
const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
];

export const videoSuggestTool: ToolDefinition = {
  name: "video_suggest",
  tag: "VIDEO_SUGGEST",
  description: "Suggest video ideas with first-frame images. Use when the user wants video ideas, video concepts, or video suggestions.",
  instruction: `Use this tool when the user wants video ideas, video concepts, video suggestions, or asks something like "give me video ideas", "suggest some videos", "what videos should I make", etc.

RULES:
- You must give exactly four suggestions unless the user explicitly asks for fewer or more.
- You must give exactly four suggestions unless the user explicitly asks for fewer or more.
- You must give exactly four suggestions unless the user explicitly asks for fewer or more.
- The absolute maximum number of suggestions you can give is ${MAX_SUGGESTIONS}. If the user asks for more than ${MAX_SUGGESTIONS}, you should give ${MAX_SUGGESTIONS} suggestions.
- For each suggestion, wrap it in <VIDEO_SUGGEST>...</VIDEO_SUGGEST> tags with a JSON object.
- Do NOT output markdown code blocks. Just the raw tags.
- For each suggestion, choose an appropriate aspect ratio from: ${SUPPORTED_ASPECT_RATIOS.join(", ")}
  - Use "16:9" for wide landscape/cinematic scenes (most common for video)
  - Use "9:16" for tall portrait/mobile content (TikTok, Reels, Shorts)
  - Use "1:1" for square content
  Choose the most appropriate ratio based on the intended video format. Default to "16:9" or "9:16" unless the user specifies otherwise.

**If the user's input contains one or more URLs, you should keep ALL of them AS IS in the prompt.**

**The image generation model you are invoking has the ability to browse the web and perform both Google text searches and Google image searches. Therefore, if a user's request depends on real-time information—such as current weather conditions or data outside your existing knowledge—you should explicitly instruct the model, within the image generation prompt, to perform Google searches to retrieve up-to-date information. When the request involves visual references—such as a specific person's appearance, a landmark, a product, or any subject where seeing an example would help—you should specifically instruct the model to perform a Google image search for that subject.**

OUTPUT FORMAT:
- Output an introductory <TEXT> tag first, then all <VIDEO_SUGGEST> tags.
- Each <VIDEO_SUGGEST> tag is self-contained. The JSON object must contain:
  - "title": A short, descriptive title for the video idea.
  - "aspectRatio": The aspect ratio for the first frame image.
  - "prompt": A detailed image generation prompt for the first frame / opening shot of the video. This should be a static, visually striking image that sets the scene for the video.
  - "videoIdea": A one-sentence story logline for the video — capture the core narrative arc, emotion, and visual hook in a single concise sentence.`,
  examples: [
    `<VIDEO_SUGGEST>{"title": "Sunset Beach Walk", "aspectRatio": "16:9", "prompt": "A cinematic wide shot of a couple standing at the edge of a golden sandy beach at sunset, waves gently lapping at their feet, warm golden hour light casting long shadows, the sky painted in oranges and purples, shot from behind them looking out at the horizon", "videoIdea": "A couple walks hand-in-hand along the shoreline as the camera dollies from behind to a side profile, ending on their silhouette against a vibrant sunset sky."}</VIDEO_SUGGEST>`,
    `<VIDEO_SUGGEST>{"title": "City Rooftop Dance", "aspectRatio": "9:16", "prompt": "A stylish couple on a dimly lit rooftop at night, city skyline glowing behind them, string lights draped overhead, the woman mid-spin in a flowing red dress, motion blur on the dress hem, moody cinematic lighting", "videoIdea": "On a glittering rooftop at night, a woman spins in a red dress as the camera orbits the couple in a slow 360, ending on a close-up of their hands clasping."}</VIDEO_SUGGEST>`,
    `<VIDEO_SUGGEST>{"title": "Forest Morning Jog", "aspectRatio": "16:9", "prompt": "A lone runner on a misty forest trail at dawn, sunbeams breaking through tall pine trees, dew on fern leaves, the runner captured mid-stride from a low angle, soft golden light illuminating dust particles in the air", "videoIdea": "A runner bursts through a misty dawn forest as the camera tracks alongside, the fog lifting to reveal the full sun-drenched trail in a final drone pullback."}</VIDEO_SUGGEST>`,
    `<VIDEO_SUGGEST>{"title": "Underwater Coral Dive", "aspectRatio": "16:9", "prompt": "A scuba diver hovering above a vibrant coral reef, schools of colorful tropical fish swimming around, crystal clear turquoise water, sunlight rays piercing down from the surface, wide-angle underwater photography style", "videoIdea": "A diver plunges beneath the surface and glides over a vibrant coral reef as fish scatter and regroup, ending with a slow upward tilt toward shimmering sunlight."}</VIDEO_SUGGEST>`,
  ],
  waitForOutput: false,
  fireAndForget: true,
  createPart: (parsed: any) => ({
    type: "agent_video_suggest" as const,
    imageId: generateImageId(),
    title: "Loading...",
    aspectRatio: parsed.aspectRatio,
    prompt: parsed.prompt,
    videoIdea: parsed.videoIdea || "",
    status: "loading" as const,
  }),
};
