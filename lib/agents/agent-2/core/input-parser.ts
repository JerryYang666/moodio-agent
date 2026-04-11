import { Message, MessageContentPart } from "@/lib/llm/types";
import { RequestContext } from "../context";
import { getSignedImageUrl } from "@/lib/storage/s3";

/** Maximum number of user messages to keep in history (excluding the first user message). */
const MAX_USER_MESSAGES = 15;

/**
 * Converts proprietary Message types into LLM-compatible messages.
 * Ported from Agent 1's prepareMessages() (lines 274-500).
 */
export class InputParser {
  /**
   * Clean and convert conversation history messages for the LLM.
   * - Converts agent_image/direct_image/agent_video_suggest/agent_video/direct_video/agent_shot_list/agent_search/tool_call to text summaries
   * - Filters to keep first user+assistant pair + last N user messages
   * - Converts image parts to image_url + text annotations
   * - Keeps only the latest internal_think part
   */
  parseHistory(history: Message[], ctx: RequestContext): any[] {
    // Step 1: Convert agent-specific parts to text summaries
    const cleanHistory = history.map((m) => {
      if (Array.isArray(m.content)) {
        return {
          ...m,
          content: m.content.map((p) => {
            if (p.type === "agent_image" || p.type === "direct_image") {
              return {
                type: "text" as const,
                text: `[Image ID: ${p.imageId || "unknown"}] Suggestion: ${p.title}\nAspect Ratio: ${p.aspectRatio || "1:1"}\nPrompt: ${p.prompt}`,
              };
            }
            if (p.type === "agent_video_suggest") {
              return {
                type: "text" as const,
                text: `[Image ID: ${p.imageId || "unknown"}] Video Suggestion: ${p.title}\nAspect Ratio: ${p.aspectRatio || "16:9"}\nFirst Frame Prompt: ${p.prompt}\nVideo Idea: ${p.videoIdea}`,
              };
            }
            if (p.type === "agent_video") {
              return {
                type: "text" as const,
                text: `[Video Configuration: ${p.config.modelName} - "${p.config.prompt}" - Status: ${p.status}${p.generationId ? ` (Generation ID: ${p.generationId})` : ""}]`,
              };
            }
            if (p.type === "direct_video") {
              return {
                type: "text" as const,
                text: `[Video Generation: ${p.config.modelName} - "${p.config.prompt}" - Status: ${p.status}${p.generationId ? ` (Generation ID: ${p.generationId})` : ""}]`,
              };
            }
            if (p.type === "agent_shot_list") {
              const header = p.columns.join(" | ");
              const rows = p.rows
                .map((r) => r.cells.map((c) => c.value).join(" | "))
                .join("\n");
              return {
                type: "text" as const,
                text: `[Shot List: ${p.title}]\n${header}\n${rows}`,
              };
            }
            if (p.type === "agent_search") {
              return {
                type: "text" as const,
                text: `[Search executed: text="${p.query.textSearch}", filters=${JSON.stringify(p.query.filterIds)}]`,
              };
            }
            if (p.type === "tool_call") {
              return {
                type: "text" as const,
                text: `[Tool call: ${p.tool} — ${p.status}]`,
              };
            }
            if (p.type === "video") {
              return {
                type: "text" as const,
                text: `[Video | ID: ${p.videoId} | Source: ${p.source} | URL: ${p.videoUrl}]`,
              };
            }
            if (p.type === "audio") {
              return {
                type: "text" as const,
                text: `[Audio | ID: ${p.audioId} | Title: ${p.title || "Untitled"} | Source: ${p.source}]`,
              };
            }
            // Strip suggestions and ask_user — they are UI-only and should never be sent back to the LLM
            if (p.type === "suggestions" || p.type === "agent_ask_user") {
              return null;
            }
            return p;
          }).filter(Boolean) as MessageContentPart[],
        };
      }
      return m;
    });

    // Step 2: Filter history by user message count
    const filteredHistory = this.filterMessagesByUserCount(cleanHistory);

    if (cleanHistory.length !== filteredHistory.length) {
      console.log(
        `[Agent-2] Conversation history filtered: ${cleanHistory.length} → ${filteredHistory.length} messages (keeping first user + first assistant + last ${MAX_USER_MESSAGES} user messages)`
      );
    }

    // Step 3: Find last think part location
    let lastThinkMessageIndex = -1;
    let lastThinkPartIndex = -1;
    for (let i = 0; i < filteredHistory.length; i++) {
      const msg = filteredHistory[i];
      if (Array.isArray(msg.content)) {
        for (let j = 0; j < msg.content.length; j++) {
          if (msg.content[j].type === "internal_think") {
            lastThinkMessageIndex = i;
            lastThinkPartIndex = j;
          }
        }
      }
    }

    // Step 4: Convert to LLM message format
    return filteredHistory.map((m, mIdx) => {
      if (Array.isArray(m.content)) {
        const newContent = m.content
          .map((c, pIdx) => {
            if (c.type === "image") {
              return {
                type: "text",
                text: `[User provided an image in this message | Image ID: ${c.imageId}${c.title ? ` | Title: ${c.title}` : ""}]`,
              };
            }
            if (c.type === "internal_think") {
              // Only keep the latest think part and convert it to text
              if (mIdx === lastThinkMessageIndex && pIdx === lastThinkPartIndex) {
                return {
                  type: "text",
                  text: `(agent thinking process)\n${c.text}`,
                };
              }
              return null;
            }
            return c;
          })
          .filter((c) => c !== null);

        return { role: m.role, content: newContent };
      }
      return m;
    });
  }

  /**
   * Convert the current user message for the LLM.
   * - Converts image parts to image_url + text annotations
   * - Appends reference images with their tags
   * - Appends precision editing prompt if applicable
   * - Appends image quantity instruction if user selected a specific number
   */
  parseUserMessage(userMessage: Message, ctx: RequestContext): any {
    const formattedUserMessage: any = {
      role: userMessage.role,
      content: Array.isArray(userMessage.content)
        ? userMessage.content.flatMap((p) => {
            if (p.type === "image") {
              return [
                {
                  type: "text" as const,
                  text: `[Image ID: ${p.imageId}${p.title ? ` | Title: ${p.title}` : ""}]`,
                },
                {
                  type: "image_url" as const,
                  image_url: {
                    url: getSignedImageUrl(p.imageId),
                  },
                },
              ];
            }
            if (p.type === "video") {
              return [{
                type: "text" as const,
                text: `[Video | ID: ${p.videoId} | Source: ${p.source} | URL: ${p.videoUrl}]`,
              }];
            }
            if (p.type === "audio") {
              return [{
                type: "text" as const,
                text: `[Audio | ID: ${p.audioId} | Title: ${p.title || "Untitled"}]`,
              }];
            }
            return [p];
          })
        : [{ type: "text", text: userMessage.content as string }],
    };

    // Add reference images with their tags
    if (ctx.referenceImages.length > 0) {
      if (!Array.isArray(formattedUserMessage.content)) {
        formattedUserMessage.content = [{ type: "text", text: formattedUserMessage.content }];
      }

      for (const ref of ctx.referenceImages) {
        const tagLabel = ref.tag === "none" ? "general reference" : ref.tag;
        formattedUserMessage.content.push({
          type: "text",
          text: `[Reference Image ID: ${ref.imageId} - ${tagLabel}${ref.title ? `: ${ref.title}` : ""}]`,
        });
        formattedUserMessage.content.push({
          type: "image_url",
          image_url: {
            url: getSignedImageUrl(ref.imageId),
          },
        });
      }

      console.log(
        `[Agent-2] Added ${ctx.referenceImages.length} reference image(s) with tags to user message`
      );
    }

    // Add precision editing prompt
    if (ctx.precisionEditing && ctx.imageIds.length > 0) {
      if (Array.isArray(formattedUserMessage.content)) {
        formattedUserMessage.content.push({
          type: "text",
          text: "\nPrecision Editing on. Make sure that your prompt is describing an edit to the picture(s).",
        });
      }
    }

    return formattedUserMessage;
  }

  /**
   * Filter conversation history to keep only the first user message, first assistant message,
   * and the last N user messages (and their subsequent messages).
   * Ported from Agent 1's filterMessagesByUserCount().
   */
  private filterMessagesByUserCount(history: Message[]): Message[] {
    if (history.length === 0) return history;

    const userMessageIndices: number[] = [];
    for (let i = 0; i < history.length; i++) {
      if (history[i].role === "user") {
        userMessageIndices.push(i);
      }
    }

    if (userMessageIndices.length <= MAX_USER_MESSAGES + 1) return history;

    const firstUserIndex = userMessageIndices[0];

    let firstAssistantIndex = -1;
    for (let i = firstUserIndex + 1; i < history.length; i++) {
      if (history[i].role === "assistant") {
        firstAssistantIndex = i;
        break;
      }
    }

    if (firstAssistantIndex === -1) return history;

    const cutoffUserMessageIndex =
      userMessageIndices[userMessageIndices.length - MAX_USER_MESSAGES];

    return [
      ...history.slice(0, firstAssistantIndex + 1),
      ...history.slice(cutoffUserMessageIndex),
    ];
  }
}
