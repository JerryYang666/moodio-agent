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

Rules for video creation:
1. A source image from the conversation is REQUIRED. By default, the system uses the most recent image, but you can specify a particular image by including "sourceImageId" in the <VIDEO> JSON (e.g., \`"sourceImageId": "abc123"\`). Use this when the user asks to animate a specific image that is not the most recent one.
2. If there are NO images in the conversation, do NOT output a <VIDEO> tag. Instead, ask the user to provide or generate an image first.
3. Write a detailed, descriptive prompt about the motion, camera movement, and animation.
4. Choose parameters that best match the user's request.
5. Only output ONE <VIDEO> tag per response.
6. You MUST also include a <TEXT> response explaining what video configuration you've prepared.
7. Do NOT output <JSON> image suggestions when outputting a <VIDEO> tag.`,
  examples: [
    `<VIDEO>{"modelId": "fal-ai/bytedance/seedance/v1.5/pro/image-to-video", "prompt": "Gentle camera push-in on the scene. Soft ambient movement with natural swaying of elements. Subtle lighting shifts create a dreamy atmosphere. Cinematic slow motion feel with smooth transitions.", "duration": "5", "aspect_ratio": "16:9", "resolution": "720p", "generate_audio": true, "camera_fixed": false}</VIDEO>`,
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
    for (const param of modelApiConfig.params) {
      if (
        param.name === "prompt" ||
        param.name === model.imageParams.sourceImage ||
        param.name === model.imageParams.endImage
      ) continue;
      if (parsed[param.name] !== undefined) {
        videoParams[param.name] = parsed[param.name];
      } else if (param.default !== undefined) {
        videoParams[param.name] = param.default;
      }
    }

    return {
      type: "agent_video" as const,
      config: {
        modelId,
        modelName: model.name,
        prompt: parsed.prompt || "",
        sourceImageId: typeof parsed.sourceImageId === "string" ? parsed.sourceImageId : undefined,
        params: videoParams,
      },
      status: "pending" as const,
    };
  },
};
