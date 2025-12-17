import { Agent, AgentResponse } from "./types";
import { Message, MessageContentPart } from "@/lib/llm/types";
import {
  downloadImage,
  uploadImage,
  getSignedImageUrl,
} from "@/lib/storage/s3";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { getSystemPrompt } from "./system-prompts";

// Maximum number of retries for failed operations
const MAX_RETRY = 2;

// Maximum number of user messages to send to AI (excluding the first user message)
const MAX_USER_MESSAGES = 15;

// Supported aspect ratios for Gemini image generation
const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

type AspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

interface Suggestion {
  title: string;
  aspectRatio: string;
  prompt: string;
}

interface AgentOutput {
  question: string;
  suggestions: Suggestion[];
}

interface PreparedMessages {
  messages: any[];
  userImageId: string | undefined;
  userImageBase64Promise: Promise<string | undefined>;
  precisionEditing?: boolean;
  precisionEditImageId?: string;
  precisionEditImageBase64Promise?: Promise<string | undefined>;
}

export class Agent1 implements Agent {
  id = "agent-1";
  name = "Creative Assistant (Gemini)";

  async processRequest(
    history: Message[],
    userMessage: Message,
    userId: string,
    isAdmin: boolean,
    requestStartTime?: number,
    precisionEditing?: boolean,
    precisionEditImageId?: string,
    systemPromptOverride?: string
  ): Promise<AgentResponse> {
    const startTime = requestStartTime || Date.now();
    console.log(
      "[Perf] Agent processRequest start",
      `[${Date.now() - startTime}ms]`
    );

    // Step 1: Prepare messages
    const prepared = await this.prepareMessages(
      history,
      userMessage,
      startTime,
      precisionEditing,
      precisionEditImageId,
      systemPromptOverride
    );

    // Step 2: Call LLM and parse response
    const { stream, completion } = await this.callLLMAndParse(
      prepared,
      startTime,
      isAdmin
    );

    return { stream, completion };
  }

  /**
   * Filter conversation history to keep only the first user message, first assistant message,
   * and the last N user messages (and their subsequent messages)
   * @param history Array of messages to filter
   * @returns Filtered array of messages
   */
  private filterMessagesByUserCount(history: Message[]): Message[] {
    if (history.length === 0) {
      return history;
    }

    // Find indices of all user messages
    const userMessageIndices: number[] = [];
    for (let i = 0; i < history.length; i++) {
      if (history[i].role === "user") {
        userMessageIndices.push(i);
      }
    }

    // If we have fewer user messages than the limit + 1 (first user), return all
    if (userMessageIndices.length <= MAX_USER_MESSAGES + 1) {
      return history;
    }

    // Find the index of the first user message
    const firstUserIndex = userMessageIndices[0];

    // Find the index of the first assistant message (should be after first user)
    let firstAssistantIndex = -1;
    for (let i = firstUserIndex + 1; i < history.length; i++) {
      if (history[i].role === "assistant") {
        firstAssistantIndex = i;
        break;
      }
    }

    // If no assistant message found after first user, just return all
    if (firstAssistantIndex === -1) {
      return history;
    }

    // Find the index of the Nth user message from the end (where N = MAX_USER_MESSAGES)
    // We want to keep the last MAX_USER_MESSAGES user messages, so we find the (MAX_USER_MESSAGES)th from the end
    const cutoffUserMessageIndex =
      userMessageIndices[userMessageIndices.length - MAX_USER_MESSAGES];

    // Keep: [0...firstAssistantIndex] + [cutoffUserMessageIndex...end]
    const filteredHistory = [
      ...history.slice(0, firstAssistantIndex + 1),
      ...history.slice(cutoffUserMessageIndex),
    ];

    return filteredHistory;
  }

  private async prepareMessages(
    history: Message[],
    userMessage: Message,
    startTime: number,
    precisionEditing?: boolean,
    precisionEditImageId?: string,
    systemPromptOverride?: string
  ): Promise<PreparedMessages> {
    const rawSystemPrompt = systemPromptOverride || getSystemPrompt(this.id);
    const systemPrompt = rawSystemPrompt.replace(
      "{{SUPPORTED_ASPECT_RATIOS}}",
      SUPPORTED_ASPECT_RATIOS.join(", ")
    );

    // Convert previous agent_image parts to text in history
    const cleanHistory = history.map((m) => {
      if (Array.isArray(m.content)) {
        return {
          ...m,
          content: m.content.map((p) => {
            if (p.type === "agent_image") {
              return {
                type: "text" as const,
                text: `Suggestion: ${p.title}\nAspect Ratio: ${p.aspectRatio || "1:1"}\nPrompt: ${p.prompt}`,
              };
            }
            return p;
          }),
        };
      }
      return m;
    });

    // Filter history to keep only the first user message, first assistant message, and last N user messages
    const filteredHistory = this.filterMessagesByUserCount(cleanHistory);

    if (cleanHistory.length !== filteredHistory.length) {
      console.log(
        `[Agent-1] Conversation history filtered: ${cleanHistory.length} → ${filteredHistory.length} messages (keeping first user + first assistant + last ${MAX_USER_MESSAGES} user messages)`
      );
    }

    // Check for user image - search through history and current message for last user image
    let userImageId: string | undefined;
    const allMessages = [...history, userMessage];
    for (const message of allMessages) {
      if (message.role === "user" && Array.isArray(message.content)) {
        const imgPart = message.content.find((p) => p.type === "image") as
          | { type: "image"; imageId: string }
          | undefined;
        if (imgPart) {
          userImageId = imgPart.imageId;
        }
      }
    }

    // Pre-fetch user image base64 if needed
    const userImageBase64Promise = userImageId
      ? downloadImage(userImageId).then((buf) => buf?.toString("base64"))
      : Promise.resolve(undefined);

    // Pre-fetch precision edit image base64 if needed
    const precisionEditImageBase64Promise = precisionEditImageId
      ? downloadImage(precisionEditImageId).then((buf) =>
          buf?.toString("base64")
        )
      : Promise.resolve(undefined);

    console.log(
      "[Perf] User/Precision image base64 prepared",
      `[${Date.now() - startTime}ms]`
    );

    const formattedUserMessage: any = {
      role: userMessage.role,
      content: Array.isArray(userMessage.content)
        ? userMessage.content.map((p) => {
            if (p.type === "image") {
              return {
                type: "image_url",
                image_url: {
                  url: getSignedImageUrl(p.imageId),
                },
              };
            }
            return p;
          })
        : [
            // If userMessage.content is string, convert to array format for consistency
            { type: "text", text: userMessage.content as string },
          ],
    };

    // Add precision editing prompt and image if applicable
    if (precisionEditing) {
      if (Array.isArray(formattedUserMessage.content)) {
        formattedUserMessage.content.push({
          type: "text",
          text: "\nPrecision Editing on. Make sure that your prompt is describing an edit to the picture.",
        });

        if (precisionEditImageId) {
          // Prepend the precision edit image so it appears first/with context
          formattedUserMessage.content.unshift({
            type: "image_url",
            image_url: {
              url: getSignedImageUrl(precisionEditImageId),
            },
          });
        }
      }
    }

    // Find last think part location in filteredHistory
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

    const messages = [
      { role: "system", content: systemPrompt },
      ...filteredHistory.map((m, mIdx) => {
        if (Array.isArray(m.content)) {
          // Filter and transform content parts
          const newContent = m.content
            .map((c, pIdx) => {
              if (c.type === "image") {
                return {
                  type: "image_url",
                  image_url: {
                    url: getSignedImageUrl(c.imageId),
                  },
                };
              }
              if (c.type === "internal_think") {
                // Only keep the latest think part and convert it to text
                if (
                  mIdx === lastThinkMessageIndex &&
                  pIdx === lastThinkPartIndex
                ) {
                  return {
                    type: "text",
                    text: `(agent thinking process)\n${c.text}`,
                  };
                }
                // Filter out other think parts
                return null;
              }
              return c;
            })
            .filter((c) => c !== null); // Remove nulls

          return {
            role: m.role,
            content: newContent,
          };
        }
        return m;
      }),
      formattedUserMessage,
    ];
    console.log(
      "[Perf] Agent messages prepared",
      `[${Date.now() - startTime}ms]`
    );

    return {
      messages,
      userImageId,
      userImageBase64Promise,
      precisionEditing,
      precisionEditImageId,
      precisionEditImageBase64Promise,
    };
  }

  private async callLLMAndParse(
    prepared: PreparedMessages,
    startTime: number,
    isAdmin: boolean
  ): Promise<AgentResponse> {
    const encoder = new TextEncoder();
    let resolveCompletion: (value: Message) => void;
    let rejectCompletion: (error: Error) => void;
    const completion = new Promise<Message>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    let currentAttempt = 0;
    const self = this;

    // Create a wrapper stream that handles retries
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            // Only stream internal_* to admins
            if (data.type?.startsWith("internal_") && !isAdmin) {
              return;
            }
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          } catch (e) {
            // Controller might be closed
          }
        };

        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
          try {
            if (attempt > 0) {
              console.log(
                `[Agent-1] Retrying LLM call and parse, attempt ${attempt + 1}/${MAX_RETRY + 1}`
              );

              // Send invalidation signal to frontend before retry
              send({ type: "invalidate", reason: "retry" });

              // Append format reminder to the last user message on retry
              const lastMessage =
                prepared.messages[prepared.messages.length - 1];
              if (lastMessage && lastMessage.role === "user") {
                if (Array.isArray(lastMessage.content)) {
                  // Add reminder as text part
                  lastMessage.content.push({
                    type: "text",
                    text: "\n\nPlease remember to follow the required format with <TEXT> and <JSON> tags as specified in the system prompt.",
                  });
                } else if (typeof lastMessage.content === "string") {
                  // Append to string content
                  lastMessage.content +=
                    "\n\nPlease remember to follow the required format with <TEXT> and <JSON> tags as specified in the system prompt.";
                }
              }
            }

            const result = await self.callLLMAndParseCore(
              prepared,
              startTime,
              send
            );

            if (attempt > 0) {
              console.log(
                `[Agent-1] LLM call and parse succeeded on retry attempt ${attempt + 1}`
              );
            }

            // Success - resolve completion and close controller
            resolveCompletion(result);
            controller.close();
            return;
          } catch (error) {
            lastError = error as Error;
            console.error(
              `[Agent-1] LLM call and parse attempt ${attempt + 1}/${MAX_RETRY + 1} failed:`,
              error
            );
          }
        }

        // All retries exhausted - send failure signal to frontend
        console.error(
          `[Agent-1] LLM call and parse failed after ${MAX_RETRY + 1} attempts`
        );

        // Send retry exhausted signal so frontend can restore user input
        send({
          type: "retry_exhausted",
          reason: "All retry attempts failed",
          error: lastError?.message || "Unknown error",
        });

        rejectCompletion(lastError || new Error("LLM call and parse failed"));
        try {
          controller.close();
        } catch (e) {}
      },
    });

    return { stream, completion };
  }

  private async callLLMAndParseCore(
    prepared: PreparedMessages,
    startTime: number,
    send: (data: any) => void
  ): Promise<Message> {
    const client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    });

    console.log(
      "prepared.messages",
      JSON.stringify(prepared.messages, null, 2)
    );

    // Call LLM with stream
    const llmStream = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: prepared.messages as any,
      stream: true,
    });
    console.log(
      "[Perf] Agent LLM stream started",
      `[${Date.now() - startTime}ms]`
    );

    // Track final content for completion
    const finalContent: MessageContentPart[] = [];
    const self = this;

    console.log(
      "[Perf] Agent output stream start",
      `[${Date.now() - startTime}ms]`
    );
    let buffer = "";
    let fullLlmResponse = ""; // Track complete LLM response
    let thoughtSent = false;
    let questionSent = false;
    let suggestionIndex = 0;
    const imageTasks: Promise<void>[] = [];

    try {
      for await (const chunk of llmStream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        buffer += delta;
        fullLlmResponse += delta; // Accumulate full response

        // Check for invalid text outside tags
        // Valid text should only be inside <TEXT>...</TEXT> or <JSON>...</JSON> or <think>...</think>
        // Whitespace outside is OK
        let checkBuffer = buffer;
        let inAngleBrackets = false;
        let inTextTag = false;
        let inJsonTag = false;
        let inThinkTag = false;
        let i = 0;

        while (i < checkBuffer.length) {
          const char = checkBuffer[i];
          const remaining = checkBuffer.substring(i);

          // Check for opening tags
          if (remaining.startsWith("<TEXT>")) {
            inTextTag = true;
            i += 6;
            continue;
          } else if (remaining.startsWith("</TEXT>")) {
            inTextTag = false;
            i += 7;
            continue;
          } else if (remaining.startsWith("<JSON>")) {
            inJsonTag = true;
            i += 6;
            continue;
          } else if (remaining.startsWith("</JSON>")) {
            inJsonTag = false;
            i += 7;
            continue;
          } else if (remaining.startsWith("<think>")) {
            inThinkTag = true;
            i += 7;
            continue;
          } else if (remaining.startsWith("</think>")) {
            inThinkTag = false;
            i += 8;
            continue;
          }

          // Track if we're in angle brackets (for any other tags)
          if (char === "<") {
            inAngleBrackets = true;
          } else if (char === ">") {
            inAngleBrackets = false;
          } else if (
            !inTextTag &&
            !inJsonTag &&
            !inThinkTag &&
            !inAngleBrackets &&
            char.trim() !== ""
          ) {
            // Found non-whitespace text outside of valid tag content
            console.error(
              `[Agent-1] Invalid text outside tags detected: "${checkBuffer.substring(Math.max(0, i - 20), Math.min(checkBuffer.length, i + 20))}"`
            );
            throw new Error(
              `Invalid LLM response: text outside tags at position ${i}`
            );
          }

          i++;
        }

        // 1. Parse Thought
        if (!thoughtSent) {
          const tStart = buffer.indexOf("<think>");
          const tEnd = buffer.indexOf("</think>");

          if (tStart !== -1 && tEnd !== -1) {
            const thoughtText = buffer.substring(tStart + 7, tEnd).trim();
            send({ type: "internal_think", content: thoughtText });
            console.log(
              "[Perf] Agent thought sent",
              `[${Date.now() - startTime}ms]`
            );
            finalContent.push({ type: "internal_think", text: thoughtText });
            thoughtSent = true;
            buffer = buffer.substring(tEnd + 8);
          }
        }

        // 2. Parse Question
        if (!questionSent) {
          const qStart = buffer.indexOf("<TEXT>");
          const qEnd = buffer.indexOf("</TEXT>");

          if (qStart !== -1 && qEnd !== -1) {
            const questionText = buffer.substring(qStart + 6, qEnd).trim();
            send({ type: "text", content: questionText });
            console.log(
              "[Perf] Agent question sent",
              `[${Date.now() - startTime}ms]`
            );
            finalContent.push({ type: "text", text: questionText });
            questionSent = true;
            buffer = buffer.substring(qEnd + 7);
          }
        }

        // 2. Parse Suggestions (max 8)
        while (buffer.includes("</JSON>")) {
          const sStart = buffer.indexOf("<JSON>");
          const sEnd = buffer.indexOf("</JSON>");

          if (sStart !== -1 && sEnd !== -1) {
            if (sStart < sEnd) {
              const jsonStr = buffer.substring(sStart + 6, sEnd);
              try {
                const suggestion = JSON.parse(jsonStr);

                // Hard limit: only start up to 8 image generation tasks
                if (suggestionIndex < 8) {
                  const currentIndex = suggestionIndex;
                  suggestionIndex++;

                  // Start image generation
                  const task = (async () => {
                    try {
                      // Send placeholder when image generation starts
                      const placeholder: MessageContentPart = {
                        type: "agent_image",
                        title: "Loading...",
                        aspectRatio: suggestion.aspectRatio as AspectRatio,
                        prompt: suggestion.prompt,
                        status: "loading",
                      };
                      send({ type: "part", part: placeholder });
                      finalContent.push(placeholder);

                      console.log(
                        "[Perf] Agent image generation start",
                        `[${Date.now() - startTime}ms]`
                      );
                      const part = await self.generateImage(
                        suggestion,
                        prepared,
                        currentIndex,
                        startTime
                      );

                      // Send update
                      send({
                        type: "part_update",
                        index: currentIndex,
                        part: part,
                      });

                      // Update final content (index + 2 because of text part and internal_think part)
                      finalContent[currentIndex + 2] = part;
                    } catch (err) {
                      console.error(
                        `Image gen error for index ${currentIndex}`,
                        err
                      );
                      const errorPart: MessageContentPart = {
                        type: "agent_image",
                        title: suggestion.title || "Error",
                        aspectRatio: "1:1",
                        prompt: suggestion.prompt || "",
                        status: "error",
                      };
                      send({
                        type: "part_update",
                        index: currentIndex,
                        part: errorPart,
                      });
                      finalContent[currentIndex + 2] = errorPart;
                    }
                  })();

                  imageTasks.push(task);
                } else {
                  console.log(
                    `[Agent-1] Skipping suggestion beyond limit of 8. Title: ${suggestion.title}`
                  );
                }
              } catch (e) {
                console.error("Failed to parse suggestion JSON", e);
                throw new Error(`JSON parsing failed: ${e}`);
              }
            }
            // Remove processed part
            buffer = buffer.substring(sEnd + 7);
          } else {
            break;
          }
        }
      }

      // Stream ended
      await Promise.all(imageTasks);

      // Log final LLM response
      console.log("=== FINAL AI LLM RESPONSE ===");
      console.log(fullLlmResponse);
      console.log("=== END FINAL AI LLM RESPONSE ===");

      // If no question found (fallback)
      if (finalContent.length === 0) {
        // Maybe buffer has text?
        const text = buffer.replace(/<[^>]*>/g, "").trim();
        if (text) {
          send({ type: "text", content: text });
          finalContent.push({ type: "text", text });
        }
      }

      return {
        role: "assistant",
        content: finalContent,
        agentId: "agent-1",
      };
    } catch (err) {
      console.error("Stream processing error", err);
      throw err;
    }
  }

  private async generateImage(
    suggestion: Suggestion,
    prepared: PreparedMessages,
    index: number,
    startTime: number
  ): Promise<MessageContentPart> {
    console.log(
      `[Perf] Image generation start index=${index}`,
      `[${Date.now() - startTime}ms]`
    );

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `[Agent-1] Retrying image generation for index=${index}, attempt ${attempt + 1}/${MAX_RETRY + 1}`
          );
        }

        const result = await this.generateImageCore(
          suggestion,
          prepared,
          index,
          startTime
        );

        if (attempt > 0) {
          console.log(
            `[Agent-1] Image generation succeeded on retry attempt ${attempt + 1} for index=${index}`
          );
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(
          `[Agent-1] Image generation attempt ${attempt + 1}/${MAX_RETRY + 1} failed for index=${index}:`,
          error
        );
      }
    }

    // All retries exhausted
    console.error(
      `[Agent-1] Image generation failed after ${MAX_RETRY + 1} attempts for index=${index}`
    );
    throw lastError || new Error("Image generation failed");
  }

  private async generateImageCore(
    suggestion: Suggestion,
    prepared: PreparedMessages,
    index: number,
    startTime: number
  ): Promise<MessageContentPart> {
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY,
    });

    const aspectRatio: AspectRatio = SUPPORTED_ASPECT_RATIOS.includes(
      suggestion.aspectRatio as AspectRatio
    )
      ? (suggestion.aspectRatio as AspectRatio)
      : "1:1";

    let finalImageId: string;
    const userImageBase64 = await prepared.userImageBase64Promise;
    const precisionEditImageBase64 = prepared.precisionEditImageBase64Promise
      ? await prepared.precisionEditImageBase64Promise
      : undefined;

    // Determine if we should use image editing
    const useImageEditing =
      (prepared.precisionEditing &&
        (precisionEditImageBase64 || userImageBase64)) ||
      (prepared.userImageId && userImageBase64);

    if (useImageEditing) {
      // Image editing
      const prompt: any[] = [{ text: suggestion.prompt }];

      // Include precision edit image if available
      if (precisionEditImageBase64) {
        prompt.push({
          inlineData: {
            mimeType: "image/png",
            data: precisionEditImageBase64,
          },
        });
      }
      // Include user uploaded image ONLY if precision edit image is NOT provided
      // If precision editing is on but no specific image ID was passed, we edit the last user image
      else if (userImageBase64) {
        prompt.push({
          inlineData: {
            mimeType: "image/png",
            data: userImageBase64,
          },
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: prompt,
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: "2K",
          },
          tools: [{ googleSearch: {} }],
        },
      });

      const candidates = (response as any).candidates;
      let generatedImageData: string | undefined;
      if (candidates && candidates.length > 0) {
        const parts = candidates[0].content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData) {
              generatedImageData = part.inlineData.data;
              break;
            }
          }
        }
      }

      if (!generatedImageData) {
        console.log(
          "[Agent-1] No image data in Gemini response (image editing). Full response:",
          JSON.stringify(response, null, 2)
        );
        throw new Error("No image data in Gemini response");
      }
      const buf = Buffer.from(generatedImageData, "base64");
      finalImageId = await uploadImage(buf, "image/png");
    } else {
      // Text to image
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: suggestion.prompt,
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: "2K",
          },
          tools: [{ googleSearch: {} }],
        },
      });

      const candidates = (response as any).candidates;
      let generatedImageData: string | undefined;
      if (candidates && candidates.length > 0) {
        const parts = candidates[0].content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData) {
              generatedImageData = part.inlineData.data;
              break;
            }
          }
        }
      }

      if (!generatedImageData) {
        console.log(
          "[Agent-1] No image data in Gemini response (text-to-image). Full response:",
          JSON.stringify(response, null, 2)
        );
        throw new Error("No image data in Gemini response");
      }
      const buf = Buffer.from(generatedImageData, "base64");
      finalImageId = await uploadImage(buf, "image/png");
    }

    const result: MessageContentPart = {
      type: "agent_image",
      imageId: finalImageId,
      imageUrl: getSignedImageUrl(finalImageId),
      title: suggestion.title,
      aspectRatio: aspectRatio,
      prompt: suggestion.prompt,
      status: "generated",
    };
    console.log(
      `[Perf] Image generation end index=${index}`,
      `[${Date.now() - startTime}ms]`
    );
    return result;
  }
}

export const agent1 = new Agent1();
