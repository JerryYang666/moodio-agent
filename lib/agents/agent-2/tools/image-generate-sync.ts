import { ToolDefinition } from "./types";
import { generateImageId } from "@/lib/storage/s3";

const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
];

export const imageGenerateSyncTool: ToolDefinition = {
  name: "image_generate_sync",
  tag: "IMAGE_GENERATE_SYNC",
  description:
    "Synchronous image generation — blocks until the image is ready and returns the imageId for use in subsequent actions",
  instruction: `Synchronous Image Generation (IMAGE_GENERATE_SYNC):
This is a SYNCHRONOUS tool that generates a single image and returns its imageId once complete.

WHEN TO USE:
- ONLY use <IMAGE_GENERATE_SYNC> when you NEED the generated image's ID for a subsequent action (e.g., creating a video from the image via <VIDEO> with sourceImageId).
- In all other cases, use the regular <IMAGE> tag instead — it is faster and non-blocking.

HOW IT WORKS:
- The response pauses while the image is being generated.
- Once the image is ready, you will receive the imageId and imageUrl in a follow-up system message.
- You can then use that imageId in subsequent tool calls (e.g., as sourceImageId in a <VIDEO> tag).

OUTPUT FORMAT:
Wrap a single JSON object in <IMAGE_GENERATE_SYNC>...</IMAGE_GENERATE_SYNC> tags with "title", "aspectRatio", "prompt", and optionally "referenceImageIds".
Only output ONE <IMAGE_GENERATE_SYNC> tag per response.
Always output a <TEXT> response before the tag explaining what you are doing.

referenceImageIds (optional): An array of Image IDs from the conversation to use as reference images for editing. Use this when you need to modify or build upon a previously generated or uploaded image that is NOT attached to the current message. If the user's current message already includes an image attachment, do NOT include referenceImageIds — the attached images will be used automatically.

Choose an appropriate aspect ratio from: ${SUPPORTED_ASPECT_RATIOS.join(", ")}

**If the user's input contains one or more URLs, you should keep ALL of them AS IS in the prompt.**

**The image generation model has the ability to browse the web and perform Google text/image searches. If the request depends on real-time information or visual references, instruct the model to perform the appropriate searches within the prompt.**`,
  examples: [
    `<IMAGE_GENERATE_SYNC>{"title": "Sunset over mountains", "aspectRatio": "16:9", "prompt": "A breathtaking sunset over snow-capped mountains with warm golden light..."}</IMAGE_GENERATE_SYNC>`,
    `<IMAGE_GENERATE_SYNC>{"title": "Modified sunset", "aspectRatio": "16:9", "prompt": "Add a silhouette of a hiker on the mountain ridge...", "referenceImageIds": ["abc123"]}</IMAGE_GENERATE_SYNC>`,
  ],
  waitForOutput: true,
  maxOccurrences: 1,
  createPart: (parsed: any) => ({
    type: "agent_image" as const,
    imageId: generateImageId(),
    title: "Loading...",
    aspectRatio: parsed.aspectRatio,
    prompt: parsed.prompt,
    status: "loading" as const,
  }),
  buildContinuationMessage: (resultData: any) =>
    `[System: IMAGE_GENERATE_SYNC completed]\n\nThe image has been generated successfully.\n- imageId: ${resultData.imageId}\n- imageUrl: ${resultData.imageUrl}\n\nYou can now use this imageId in subsequent actions (e.g., as "sourceImageId" in a <VIDEO> tag). Do NOT output another <IMAGE_GENERATE_SYNC> or <IMAGE> tag for this same image.`,
};
