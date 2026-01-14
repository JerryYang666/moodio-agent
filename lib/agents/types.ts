import { Message } from "@/lib/llm/types";

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
    selectedImageIds?: string[], // Array of selected image IDs (replaces precisionEditImageId)
    systemPromptOverride?: string,
    aspectRatioOverride?: string
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
    selectedImageIds?: string[], // Array of selected image IDs
    systemPromptOverride?: string,
    aspectRatioOverride?: string
  ): Promise<ParallelAgentResponse>;
}
