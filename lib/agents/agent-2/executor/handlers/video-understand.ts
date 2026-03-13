import { GoogleGenAI, createPartFromUri } from "@google/genai";
import { ToolHandler, ToolResult } from "../tool-executor";
import { ParsedTag } from "../../core/output-parser";
import { RequestContext } from "../../context";
import { downloadVideo, getSignedVideoUrl } from "@/lib/storage/s3";

export class VideoUnderstandHandler implements ToolHandler {
  async execute(parsedTag: ParsedTag, ctx: RequestContext): Promise<ToolResult> {
    const { videoId, source, videoUrl, query, startOffset, endOffset } = parsedTag.parsedContent;

    if (!query || typeof query !== "string") {
      return {
        success: false,
        error: "Missing required 'query' parameter for video understanding",
        contentParts: [
          { type: "tool_call", tool: "video_understand", status: "error" },
        ],
      };
    }

    ctx.send({ type: "tool_call", tool: "video_understand", status: "loading" });

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      ctx.send({ type: "tool_call", tool: "video_understand", status: "error" });
      return {
        success: false,
        error: "Gemini API key not configured",
        contentParts: [
          { type: "tool_call", tool: "video_understand", status: "error" },
        ],
      };
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
      let contents: any[];

      if (source === "youtube") {
        contents = [
          { fileData: { fileUri: videoUrl } },
          { text: buildQueryText(query, startOffset, endOffset) },
        ];
      } else {
        let videoBuffer: Buffer | null = null;

        if (source === "retrieval" && videoUrl) {
          const response = await fetch(videoUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch retrieval video: ${response.status}`);
          }
          videoBuffer = Buffer.from(await response.arrayBuffer());
        } else if (videoId) {
          videoBuffer = await downloadVideo(videoId);
        }

        if (!videoBuffer) {
          throw new Error("Could not download video for analysis");
        }

        const uploadedFile = await ai.files.upload({
          file: new Blob([videoBuffer], { type: "video/mp4" }),
          config: { mimeType: "video/mp4" },
        });

        if (!uploadedFile.uri || !uploadedFile.mimeType) {
          throw new Error("Failed to upload video to Gemini File API");
        }

        // Wait for file processing
        let fileState = uploadedFile.state;
        let attempts = 0;
        while (fileState === "PROCESSING" && attempts < 30) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const fileInfo = await ai.files.get({ name: uploadedFile.name! });
          fileState = fileInfo.state;
          attempts++;
        }

        if (fileState !== "ACTIVE") {
          throw new Error(`Video file processing failed with state: ${fileState}`);
        }

        contents = [
          createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
          { text: buildQueryText(query, startOffset, endOffset) },
        ];
      }

      console.log(
        `[Agent-2] VIDEO_UNDERSTAND: source=${source}, videoId=${videoId || "n/a"}, query="${query.slice(0, 80)}..."`,
        `[${Date.now() - ctx.requestStartTime}ms]`
      );

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-05-20",
        contents,
      });

      const analysisText = response.text || "No analysis generated.";

      console.log(
        `[Agent-2] VIDEO_UNDERSTAND complete: ${analysisText.length} chars`,
        `[${Date.now() - ctx.requestStartTime}ms]`
      );

      ctx.send({ type: "tool_call", tool: "video_understand", status: "complete" });

      return {
        success: true,
        data: { analysis: analysisText },
        contentParts: [
          { type: "tool_call", tool: "video_understand", status: "complete" },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[Agent-2] VIDEO_UNDERSTAND error:", error);

      ctx.send({ type: "tool_call", tool: "video_understand", status: "error" });

      return {
        success: false,
        error: `Video understanding failed: ${errorMessage}`,
        contentParts: [
          { type: "tool_call", tool: "video_understand", status: "error" },
        ],
      };
    }
  }
}

function buildQueryText(query: string, startOffset?: number, endOffset?: number): string {
  let text = query;
  if (typeof startOffset === "number" || typeof endOffset === "number") {
    const parts: string[] = [];
    if (typeof startOffset === "number") parts.push(`start at ${startOffset}s`);
    if (typeof endOffset === "number") parts.push(`end at ${endOffset}s`);
    text += `\n\n[Analyze the segment: ${parts.join(", ")}]`;
  }
  return text;
}
