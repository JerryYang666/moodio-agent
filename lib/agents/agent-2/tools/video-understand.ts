import { ToolDefinition } from "./types";

export const videoUnderstandTool: ToolDefinition = {
  name: "video_understand",
  tag: "VIDEO_UNDERSTAND",
  description: "Analyze video content using Gemini vision",
  instruction: `Video Understanding:
You can analyze videos that the user has provided in the conversation. This tool uses Gemini's video understanding capabilities which can process BOTH audio and visual streams of a video.

Capabilities:
- Describe, segment, and extract information from videos
- Answer questions about video content with detailed visual and audio descriptions
- Refer to specific timestamps within a video using MM:SS format (e.g., "What happens at 01:15?")
- Analyze specific portions of a video by providing start/end offsets (in seconds)
- Extract key events, scenes, text overlays, spoken dialogue, music, and sound effects
- Videos are sampled at 1 frame per second by default, so very fast action sequences may lose some detail

To analyze a video, output a <VIDEO_UNDERSTAND> tag with a JSON body:
<VIDEO_UNDERSTAND>{"videoId":"...","source":"...","videoUrl":"...","query":"detailed question about the video"}</VIDEO_UNDERSTAND>

Parameters:
- videoId: The video ID from the [Video] annotation in the conversation
- source: The source ("retrieval", "upload", "library", "ai_generated")
- videoUrl: The URL from the [Video] annotation
- query: A detailed, specific question about the video. Be thorough in your query -- ask for timestamps, visual details, audio content, etc. as needed to fully answer the user's question
- startOffset (optional): Start time in seconds to analyze only a portion of the video (e.g., "60" for 1 minute in)
- endOffset (optional): End time in seconds for the clip to analyze

You can also analyze YouTube videos if the user provides a YouTube URL:
<VIDEO_UNDERSTAND>{"videoUrl":"https://www.youtube.com/watch?v=...","source":"youtube","query":"..."}</VIDEO_UNDERSTAND>

Tips for writing good queries:
- When the user asks about a specific moment, include the timestamp in your query: "What is shown at 00:45?"
- When you need a comprehensive overview, ask for both audio and visual details: "Describe the key events, providing both audio and visual details with timestamps for salient moments."
- Use startOffset/endOffset to focus on a specific segment if the user is asking about a particular section.`,
  examples: [
    `<VIDEO_UNDERSTAND>{"videoId":"b00bcbbe-bdd0-4d99-806b-008ebf2aba92","source":"upload","videoUrl":"https://cdn0.example.com/videos/b00bcbbe-bdd0-4d99-806b-008ebf2aba92","query":"Describe the key events and visual elements in this video"}</VIDEO_UNDERSTAND>`,
  ],
  waitForOutput: true,
  maxOccurrences: 1,
  createPart: () => ({
    type: "tool_call" as const,
    tool: "video_understand",
    status: "loading" as const,
  }),
  buildContinuationMessage: (resultData: any) =>
    `[System: Tool call result for VIDEO_UNDERSTAND]\n\n${resultData.analysis}`,
};
