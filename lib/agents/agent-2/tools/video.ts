import { ToolDefinition } from "./types";
import {
  getVideoModelsPromptText,
  DEFAULT_VIDEO_MODEL_ID,
  getVideoModel,
  getModelConfigForApi,
} from "@/lib/video/models";

export const videoTool: ToolDefinition = {
  name: "video",
  tag: "VIDEO",
  description: "Video creation configuration from chat",
  instruction: `You can also help the user CREATE a video directly from the chat. When the user explicitly asks to create, generate, or make a video (not just get a prompt), you should output a <VIDEO> tag with a structured JSON configuration.

IMPORTANT: Only use <VIDEO> when the user clearly wants to CREATE/GENERATE a video. If they just want a prompt suggestion, use the video-prompt code block format instead.

To create a video configuration, output a <VIDEO> tag with a JSON object that includes a "modelId" field to select the model:
<VIDEO>{"modelId": "model-id-here", "prompt": "Detailed video generation prompt...", "duration": "5", "aspect_ratio": "16:9", "resolution": "720p"}</VIDEO>

If the user doesn't specify a model, use the default model. If the user asks for a specific model by name, use the matching modelId. Choose parameters that are valid for the selected model — different models support different parameters.
When using Seedance 2.0 family models, pick the right variant based on the user's request: use "seedance-2.0" for standard image-to-video or text-to-video, "seedance-2.0-reference" when the user wants to use reference media (images, videos, or audio as @image1/@video1/@audio1), "seedance-2.0-fast" for faster generation, and "seedance-2.0-fast-reference" for fast generation with references.

Rules for video creation:
1. For image-to-video models (those with a source image parameter): a source image from the conversation is REQUIRED. By default, the system uses the most recent image, but you can specify a particular image by including "sourceImageId" in the <VIDEO> JSON (e.g., \`"sourceImageId": "abc123"\`). Use this when the user asks to animate a specific image that is not the most recent one.
2. For text-to-video models (those marked "Type: text-to-video"): NO source image is needed. You can use these models even when there are no images in the conversation.
3. If using an image-to-video model and there are NO images in the conversation, do NOT output a <VIDEO> tag directly. Instead, first use <IMAGE_GENERATE_SYNC> to create an image. Once you receive the imageId from the sync result, output a <VIDEO> tag with that imageId as "sourceImageId".
4. For models with optional reference image/asset parameters (type: "asset"): you can pass an Image ID from the conversation as the value. For example, if a model has an "image_url" asset parameter, include \`"image_url": "abc123"\` where "abc123" is the imageId. The system will resolve it to the actual URL. If the user hasn't provided an image and doesn't want one, simply omit the parameter.
5. For models with a "media_references" parameter (e.g., Seedance 2.0 Reference): pass an array of references, each with \`type\` ("image", "video", or "audio") and \`id\` (Image ID, Video ID, or Audio ID from the conversation). Reference them in the prompt as @image1, @video1, @audio1, etc. Example: \`"media_references": [{"type": "image", "id": "abc123"}, {"type": "video", "id": "def456"}, {"type": "audio", "id": "ghi789"}]\`.
6. Write a detailed, descriptive prompt about the motion, camera movement, and animation.
7. Choose parameters that best match the user's request.
8. Only output ONE <VIDEO> tag per response.
9. You MUST also include a <TEXT> response explaining what video configuration you've prepared.
10. Do NOT output <IMAGE> image suggestions when outputting a <VIDEO> tag.`,
  examples: [
    `<VIDEO>{"modelId": "seedance-2.0", "prompt": "Gentle camera push-in on the scene. Soft ambient movement with natural swaying of elements. Subtle lighting shifts create a dreamy atmosphere. Cinematic slow motion feel with smooth transitions.", "duration": "5", "aspect_ratio": "16:9", "resolution": "720p", "generate_audio": true, "camera_fixed": false}</VIDEO>`,
  ],
  waitForOutput: false,
  maxOccurrences: 1,
  dynamicPromptData: () => getVideoModelsPromptText(),
  createPart: (parsed: any) => {
    const modelId =
      typeof parsed.modelId === "string" && getVideoModel(parsed.modelId)
        ? parsed.modelId
        : DEFAULT_VIDEO_MODEL_ID;
    const model = getVideoModel(modelId);
    const modelApiConfig = getModelConfigForApi(modelId);

    if (!model || !modelApiConfig) return null;

    const videoParams: Record<string, any> = {};
    const assetParamImageIds: Record<string, string> = {};
    for (const param of modelApiConfig.params) {
      if (
        param.name === "prompt" ||
        (model.imageParams && param.name === model.imageParams.sourceImage) ||
        (model.imageParams && param.name === model.imageParams.endImage)
      ) continue;

      if (param.type === "asset") {
        if (typeof parsed[param.name] === "string" && parsed[param.name]) {
          assetParamImageIds[param.name] = parsed[param.name];
        }
        continue;
      }

      if (parsed[param.name] !== undefined) {
        videoParams[param.name] = parsed[param.name];
      } else if (param.default !== undefined) {
        videoParams[param.name] = param.default;
      }
    }

    // Normalize kling_elements: ensure element_input_ids field name is used
    if (Array.isArray(videoParams.kling_elements)) {
      videoParams.kling_elements = videoParams.kling_elements.map(
        (el: Record<string, any>) => ({
          name: el.name,
          description: el.description,
          element_input_ids: el.element_input_ids || el.element_input_urls || [],
        })
      );
    }

    // Normalize media_references: ensure each entry has type and id
    if (Array.isArray(videoParams.media_references)) {
      videoParams.media_references = videoParams.media_references
        .filter(
          (ref: any) =>
            ref &&
            (ref.type === "image" || ref.type === "video" || ref.type === "audio") &&
            typeof ref.id === "string" &&
            ref.id
        )
        .map((ref: any) => ({ type: ref.type, id: ref.id }));
    }

    return {
      type: "agent_video" as const,
      config: {
        modelId,
        modelName: model.name,
        prompt: parsed.prompt || "",
        sourceImageId: typeof parsed.sourceImageId === "string" ? parsed.sourceImageId : undefined,
        params: videoParams,
        ...(Object.keys(assetParamImageIds).length > 0 ? { assetParamImageIds } : {}),
      },
      status: "pending" as const,
    };
  },
};
