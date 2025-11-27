import { Message } from "@/lib/llm/types";

export interface AgentResponse {
  stream: ReadableStream<Uint8Array>;
  completion: Promise<Message>;
}

export interface Agent {
  id: string;
  name: string;
  processRequest(
    history: Message[],
    userMessage: Message,
    userId: string,
    requestStartTime?: number,
    precisionEditing?: boolean,
    precisionEditImageId?: string
  ): Promise<AgentResponse>;
}
