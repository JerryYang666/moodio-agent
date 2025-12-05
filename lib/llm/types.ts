// Common types for LLM integration

export type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "internal_think"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "image"; imageId: string; imageUrl?: string } // imageUrl is signed CloudFront URL from API
  | {
      type: "agent_image";
      imageId?: string;
      imageUrl?: string; // Signed CloudFront URL for display
      title: string;
      aspectRatio?: string;
      prompt: string;
      status: "loading" | "generated" | "error";
      isSelected?: boolean;
    };

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | MessageContentPart[];
  agentId?: string;
  createdAt?: number; // Unix timestamp in milliseconds
}

export interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  provider?: "openai" | "anthropic";
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk>;
  chatComplete(messages: Message[], options?: ChatOptions): Promise<string>;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}
