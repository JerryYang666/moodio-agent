import { Message } from "@/lib/llm/types";
import { ImageSize } from "@/lib/image/types";

export interface AgentResponse {
  stream: ReadableStream<Uint8Array>;
  completion: Promise<Message>;
}

// Response type for parallel agent calls
export interface ParallelAgentResponse {
  stream: ReadableStream<Uint8Array>;
  completions: Promise<Message[]>; // Array of completion messages, one per variant
}

export interface Agent {
  id: string;
  name: string;
  processRequest(
    history: Message[],
    userMessage: Message,
    userId: string,
    isAdmin: boolean,
    requestStartTime?: number,
    precisionEditing?: boolean,
    imageIds?: string[], // Unified array of image IDs
    systemPromptOverride?: string,
    aspectRatioOverride?: string,
    imageSizeOverride?: ImageSize,
    imageModelId?: string,
    agentMode?: "default" | "browse"
  ): Promise<AgentResponse>;

  // Process request with parallel variants
  processRequestParallel?(
    history: Message[],
    userMessage: Message,
    userId: string,
    isAdmin: boolean,
    variantCount: number,
    requestStartTime?: number,
    precisionEditing?: boolean,
    imageIds?: string[], // Unified array of image IDs
    systemPromptOverride?: string,
    aspectRatioOverride?: string,
    imageSizeOverride?: ImageSize,
    imageModelId?: string,
    messageTimestamp?: number,
    referenceImages?: Array<{
      imageId: string;
      tag: "none" | "subject" | "scene" | "item" | "style";
      title?: string;
    }>,
    agentMode?: "default" | "browse"
  ): Promise<ParallelAgentResponse>;
}
