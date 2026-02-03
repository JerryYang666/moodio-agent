import { Agent, AgentResponse, ParallelAgentResponse } from "./types";
import { Message, MessageContentPart } from "@/lib/llm/types";
import { ImageSize } from "@/lib/image/types";
import {
  downloadImage,
  uploadImage,
  getSignedImageUrl,
  generateImageId,
} from "@/lib/storage/s3";
import OpenAI from "openai";
import { getSystemPrompt } from "./system-prompts";
import { recordEvent, sanitizeGeminiResponse } from "@/lib/telemetry";
import {
  editImageWithModel,
  generateImageWithModel,
} from "@/lib/image/service";
import { getImageModel } from "@/lib/image/models";

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
const SUPPORTED_IMAGE_SIZES: ImageSize[] = ["2k", "4k"];

interface Suggestion {
  title: string;
  aspectRatio: string;
  prompt: string;
}

interface AgentOutput {
  question: string;
  suggestions: Suggestion[];
}

/** Reference image with tag for context */
interface ReferenceImageEntry {
  imageId: string;
  tag: "none" | "subject" | "scene" | "item" | "style";
  title?: string;
}

interface PreparedMessages {
  messages: any[];
  /** All image IDs provided in the request (from user uploads, asset library, or AI-generated selections) */
  imageIds: string[];
  /** Pre-fetched base64 data for all images (used for image editing/generation) */
  imageBase64Promises: Promise<string | undefined>[];
  precisionEditing?: boolean;
  aspectRatioOverride?: AspectRatio;
  imageSizeOverride?: ImageSize;
  imageModelId?: string;
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
    imageIds?: string[], // Unified array of image IDs
    systemPromptOverride?: string,
    aspectRatioOverride?: string,
    imageSizeOverride?: ImageSize,
    imageModelId?: string
  ): Promise<AgentResponse> {
    const startTime = requestStartTime || Date.now();
    console.log(
      "[Perf] Agent processRequest start",
      `[${Date.now() - startTime}ms]`
    );

    // Validate aspect ratio override - if invalid, fall back to smart mode (undefined)
    let validatedAspectRatio: AspectRatio | undefined;
    if (aspectRatioOverride) {
      if (
        SUPPORTED_ASPECT_RATIOS.includes(aspectRatioOverride as AspectRatio)
      ) {
        validatedAspectRatio = aspectRatioOverride as AspectRatio;
        console.log(
          `[Agent-1] User selected aspect ratio: ${validatedAspectRatio}`
        );
      } else {
        console.log(
          `[Agent-1] Invalid aspect ratio "${aspectRatioOverride}" provided, falling back to smart mode`
        );
      }
    }

    let validatedImageSize: ImageSize | undefined;
    if (imageSizeOverride) {
      if (SUPPORTED_IMAGE_SIZES.includes(imageSizeOverride)) {
        validatedImageSize = imageSizeOverride;
        console.log(`[Agent-1] User selected image size: ${validatedImageSize}`);
      } else {
        console.log(
          `[Agent-1] Invalid image size "${imageSizeOverride}" provided, falling back to 2k`
        );
      }
    }

    // Step 1: Prepare messages
    const prepared = await this.prepareMessages(
      history,
      userMessage,
      startTime,
      precisionEditing,
      imageIds || [],
      systemPromptOverride,
      validatedAspectRatio,
      validatedImageSize,
      imageModelId
    );

    // Step 2: Call LLM and parse response
    const { stream, completion } = await this.callLLMAndParse(
      prepared,
      startTime,
      isAdmin,
      userId
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
    imageIds?: string[], // Unified array of image IDs from frontend
    systemPromptOverride?: string,
    aspectRatioOverride?: AspectRatio,
    imageSizeOverride?: ImageSize,
    imageModelId?: string,
    referenceImages?: ReferenceImageEntry[] // Reference images with tags
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
                text: `Suggestion: ${p.title}\nAspect Ratio: ${p.aspectRatio || "1:1"
                  }\nPrompt: ${p.prompt}`,
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

    // Get all image IDs from the current user message (these are already in imageIds from frontend)
    // The imageIds parameter contains all images the user wants to use for this request
    const pendingImageIds = imageIds || [];
    
    // Combine pending images and reference images for image generation
    const referenceImageIds = referenceImages?.map((ref) => ref.imageId) || [];
    const allImageIds = [...pendingImageIds, ...referenceImageIds];

    // Pre-fetch all image base64 data in parallel (for both pending and reference images, used for image generation)
    const imageBase64Promises = allImageIds.map((id) =>
      downloadImage(id).then((buf) => buf?.toString("base64"))
    );

    console.log(
      "[Perf] %s image base64 downloads started (%s pending + %s reference) [%sms]",
      allImageIds.length,
      pendingImageIds.length,
      referenceImageIds.length,
      Date.now() - startTime
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

    // Add reference images with their tags to the user message
    if (referenceImages && referenceImages.length > 0) {
      // Ensure content is an array
      if (!Array.isArray(formattedUserMessage.content)) {
        formattedUserMessage.content = [{ type: "text", text: formattedUserMessage.content }];
      }
      
      for (const ref of referenceImages) {
        // Add the reference image
        formattedUserMessage.content.push({
          type: "image_url",
          image_url: {
            url: getSignedImageUrl(ref.imageId),
          },
        });
        // Add tag context for the AI to understand the image's purpose
        const tagLabel = ref.tag === "none" ? "general reference" : ref.tag;
        formattedUserMessage.content.push({
          type: "text",
          text: `[Reference Image - ${tagLabel}${ref.title ? `: ${ref.title}` : ""}]`,
        });
      }
      
      console.log(
        `[Agent-1] Added ${referenceImages.length} reference image(s) with tags to user message`
      );
    }

    // Add precision editing prompt if applicable
    if (precisionEditing && allImageIds.length > 0) {
      if (Array.isArray(formattedUserMessage.content)) {
        formattedUserMessage.content.push({
          type: "text",
          text: "\nPrecision Editing on. Make sure that your prompt is describing an edit to the picture(s).",
        });
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
                // Convert history images to text placeholders instead of sending them
                // Only pending images and reference images are sent to the LLM
                return {
                  type: "text",
                  text: "[User provided an image in this message]",
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
      imageIds: allImageIds,
      imageBase64Promises,
      precisionEditing,
      aspectRatioOverride,
      imageSizeOverride,
      imageModelId,
    };
  }

  private async callLLMAndParse(
    prepared: PreparedMessages,
    startTime: number,
    isAdmin: boolean,
    userId: string
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
                `[Agent-1] Retrying LLM call and parse, attempt ${attempt + 1
                }/${MAX_RETRY + 1}`
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
              send,
              userId
            );

            if (attempt > 0) {
              console.log(
                `[Agent-1] LLM call and parse succeeded on retry attempt ${attempt + 1
                }`
              );
            }

            // Success - resolve completion and close controller
            resolveCompletion(result);
            controller.close();
            return;
          } catch (error) {
            lastError = error as Error;
            console.error(
              `[Agent-1] LLM call and parse attempt ${attempt + 1}/${MAX_RETRY + 1
              } failed:`,
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
        } catch (e) { }
      },
    });

    return { stream, completion };
  }

  private async callLLMAndParseCore(
    prepared: PreparedMessages,
    startTime: number,
    send: (data: any) => void,
    userId: string
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
              `[Agent-1] Invalid text outside tags detected: "${checkBuffer.substring(
                Math.max(0, i - 20),
                Math.min(checkBuffer.length, i + 20)
              )}"`
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

                  // Pre-generate imageId for tracking (enables parallel variant support)
                  const trackingImageId = generateImageId();

                  // Start image generation
                  const task = (async () => {
                    try {
                      // Send placeholder when image generation starts - include trackingImageId
                      const placeholder: MessageContentPart = {
                        type: "agent_image",
                        imageId: trackingImageId, // Pre-generated ID for tracking
                        title: "Loading...",
                        aspectRatio: suggestion.aspectRatio as AspectRatio,
                        prompt: suggestion.prompt,
                        status: "loading",
                      };
                      send({ type: "part", part: placeholder });
                      finalContent.push(placeholder);

                      console.log(
                        "[Perf] Agent image generation start",
                        `[${Date.now() - startTime}ms]`,
                        `imageId=${trackingImageId}`
                      );
                      const part = await self.generateImage(
                        suggestion,
                        prepared,
                        currentIndex,
                        startTime,
                        userId,
                        trackingImageId // Pass pre-generated ID
                      );

                      // Send update using imageId instead of index for parallel support
                      send({
                        type: "part_update",
                        imageId: trackingImageId,
                        part: part,
                      });

                      // Update final content by finding the placeholder with matching imageId
                      const placeholderIndex = finalContent.findIndex(
                        (p) =>
                          p.type === "agent_image" &&
                          p.imageId === trackingImageId
                      );
                      if (placeholderIndex !== -1) {
                        finalContent[placeholderIndex] = part;
                      }
                    } catch (err) {
                      console.error(
                        `Image gen error for imageId ${trackingImageId}`,
                        err
                      );
                      const errorPart: MessageContentPart = {
                        type: "agent_image",
                        imageId: trackingImageId, // Keep the tracking ID
                        title: suggestion.title || "Error",
                        aspectRatio: "1:1",
                        prompt: suggestion.prompt || "",
                        status: "error",
                      };
                      send({
                        type: "part_update",
                        imageId: trackingImageId,
                        part: errorPart,
                      });
                      // Update final content by finding the placeholder with matching imageId
                      const placeholderIndex = finalContent.findIndex(
                        (p) =>
                          p.type === "agent_image" &&
                          p.imageId === trackingImageId
                      );
                      if (placeholderIndex !== -1) {
                        finalContent[placeholderIndex] = errorPart;
                      }
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
    startTime: number,
    userId: string,
    preGeneratedImageId?: string
  ): Promise<MessageContentPart> {
    console.log(
      `[Perf] Image generation start index=${index}`,
      `[${Date.now() - startTime}ms]`,
      preGeneratedImageId ? `imageId=${preGeneratedImageId}` : ""
    );

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `[Agent-1] Retrying image generation for index=${index}, attempt ${attempt + 1
            }/${MAX_RETRY + 1}`
          );
        }

        const result = await this.generateImageCore(
          suggestion,
          prepared,
          index,
          startTime,
          userId,
          preGeneratedImageId
        );

        if (attempt > 0) {
          console.log(
            `[Agent-1] Image generation succeeded on retry attempt ${attempt + 1
            } for index=${index}`
          );
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(
          `[Agent-1] Image generation attempt ${attempt + 1}/${MAX_RETRY + 1
          } failed for index=${index}:`,
          error
        );
      }
    }

    // All retries exhausted
    console.error(
      `[Agent-1] Image generation failed after ${MAX_RETRY + 1
      } attempts for index=${index}`
    );

    // Record failure event
    const modelConfig = prepared.imageModelId
      ? getImageModel(prepared.imageModelId)
      : undefined;
    const failureMetadata: any = {
      status: "failed",
      provider: modelConfig?.provider || "unknown",
      modelId: prepared.imageModelId,
      error: lastError?.message || "Image generation failed",
      prompt: suggestion.prompt,
      aspectRatio: suggestion.aspectRatio,
      imageSize: prepared.imageSizeOverride || "2k",
    };

    if (lastError && "response" in lastError) {
      const response = (lastError as any).response;
      failureMetadata.response = sanitizeGeminiResponse(response);
    }

    await recordEvent("image_generation", userId, failureMetadata);

    throw lastError || new Error("Image generation failed");
  }

  private async generateImageCore(
    suggestion: Suggestion,
    prepared: PreparedMessages,
    index: number,
    startTime: number,
    userId: string,
    preGeneratedImageId?: string
  ): Promise<MessageContentPart> {
    // Use user-selected aspect ratio if provided, otherwise use agent's suggestion
    // If agent's suggestion is also invalid, fall back to "1:1"
    let aspectRatio: AspectRatio;
    if (prepared.aspectRatioOverride) {
      aspectRatio = prepared.aspectRatioOverride;
      console.log(
        `[Agent-1] Using user-selected aspect ratio: ${aspectRatio} for image ${index}`
      );
    } else if (
      SUPPORTED_ASPECT_RATIOS.includes(suggestion.aspectRatio as AspectRatio)
    ) {
      aspectRatio = suggestion.aspectRatio as AspectRatio;
    } else {
      aspectRatio = "1:1";
    }
    const imageSize = prepared.imageSizeOverride || "2k";

    let finalImageId: string;

    // Await all image base64 data
    const imageBase64Data = await Promise.all(prepared.imageBase64Promises);

    // Filter out undefined values and get valid base64 strings
    const validImageBase64: string[] = imageBase64Data.filter(
      (data): data is string => data !== undefined
    );

    // Determine if we should use image editing (if we have any images and precision editing is on)
    // or if we have images at all (for image-to-image generation)
    const useImageEditing =
      (prepared.precisionEditing && validImageBase64.length > 0) ||
      validImageBase64.length > 0;

    try {
      const modelId = prepared.imageModelId;
      let result;
      if (useImageEditing && validImageBase64.length > 0) {
        console.log(
          `[Agent-1] Using image editing mode with ${validImageBase64.length} image(s) for index=${index}`
        );
        result = await editImageWithModel(modelId, {
          prompt: suggestion.prompt,
          imageIds: prepared.imageIds,
          imageBase64: validImageBase64,
          aspectRatio,
          imageSize,
        });
      } else {
        result = await generateImageWithModel(modelId, {
          prompt: suggestion.prompt,
          aspectRatio,
          imageSize,
        });
      }

      // Use pre-generated imageId if provided (for parallel tracking), otherwise generate new
      finalImageId = await uploadImage(
        result.imageBuffer,
        result.contentType,
        preGeneratedImageId
      );

      const response =
        result.provider === "google"
          ? sanitizeGeminiResponse(result.response)
          : result.response;

      // Record success event
      await recordEvent("image_generation", userId, {
        status: "success",
        provider: result.provider,
        modelId: result.modelId,
        providerModelId: result.providerModelId,
        prompt: suggestion.prompt,
        aspectRatio: aspectRatio,
        imageSize,
        response,
      });
    } catch (error) {
      // If we have a response in the error (from our manual throw above), or if it's a GoogleGenerativeAIError that contains response data
      // we want to ensure it propagates up
      throw error;
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
      `[${Date.now() - startTime}ms]`,
      `imageId=${finalImageId}`
    );
    return result;
  }

  /**
   * Process request with parallel variants - runs N parallel LLM calls
   * and merges their streams into a single stream with variant IDs
   */
  async processRequestParallel(
    history: Message[],
    userMessage: Message,
    userId: string,
    isAdmin: boolean,
    variantCount: number,
    requestStartTime?: number,
    precisionEditing?: boolean,
    imageIds?: string[], // Unified array of image IDs to use for generation
    systemPromptOverride?: string,
    aspectRatioOverride?: string,
    imageSizeOverride?: ImageSize,
    imageModelId?: string,
    messageTimestamp?: number, // Timestamp to use for all variants (for frontend sync)
    referenceImages?: ReferenceImageEntry[] // Reference images with tags
  ): Promise<ParallelAgentResponse> {
    const startTime = requestStartTime || Date.now();
    // Use provided timestamp or generate one
    const variantTimestamp = messageTimestamp || Date.now();
    console.log(
      "[Perf] Agent processRequestParallel start with %s variants, %s images, %s reference images [%sms]",
      variantCount,
      imageIds?.length || 0,
      referenceImages?.length || 0,
      Date.now() - startTime
    );

    // Validate aspect ratio override
    let validatedAspectRatio: AspectRatio | undefined;
    if (aspectRatioOverride) {
      if (
        SUPPORTED_ASPECT_RATIOS.includes(aspectRatioOverride as AspectRatio)
      ) {
        validatedAspectRatio = aspectRatioOverride as AspectRatio;
      }
    }

    let validatedImageSize: ImageSize | undefined;
    if (imageSizeOverride) {
      if (SUPPORTED_IMAGE_SIZES.includes(imageSizeOverride)) {
        validatedImageSize = imageSizeOverride;
      }
    }

    // Prepare messages once (shared across all variants)
    const prepared = await this.prepareMessages(
      history,
      userMessage,
      startTime,
      precisionEditing,
      imageIds || [],
      systemPromptOverride,
      validatedAspectRatio,
      validatedImageSize,
      imageModelId,
      referenceImages
    );

    const encoder = new TextEncoder();
    const self = this;

    // Generate unique variant IDs
    const variantIds = Array.from(
      { length: variantCount },
      (_, i) =>
        `variant-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    // Track completion for each variant
    const completionPromises: Promise<Message>[] = [];
    const variantControllers: {
      controller: ReadableStreamDefaultController<Uint8Array> | null;
      done: boolean;
    }[] = variantIds.map(() => ({ controller: null, done: false }));

    // Create merged stream
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Send the message timestamp first so frontend can sync
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "message_timestamp", timestamp: variantTimestamp }) + "\n"
          )
        );

        // Start all parallel variant processing
        variantIds.forEach((variantId, variantIndex) => {
          const completionPromise = (async () => {
            const send = (data: any) => {
              try {
                // Only stream internal_* to admins
                if (data.type?.startsWith("internal_") && !isAdmin) {
                  return;
                }
                // Add variantId to all events
                const eventWithVariant = { ...data, variantId };
                controller.enqueue(
                  encoder.encode(JSON.stringify(eventWithVariant) + "\n")
                );
              } catch (e) {
                // Controller might be closed
              }
            };

            let lastError: Error | undefined;

            for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
              try {
                if (attempt > 0) {
                  console.log(
                    `[Agent-1] Retrying LLM call for variant ${variantId}, attempt ${attempt + 1}/${MAX_RETRY + 1}`
                  );
                  send({ type: "invalidate", reason: "retry" });
                }

                const result = await self.callLLMAndParseCore(
                  prepared,
                  startTime,
                  send,
                  userId
                );

                // Add variantId and createdAt to the result message
                const messageWithVariant: Message = {
                  ...result,
                  variantId,
                  createdAt: variantTimestamp,
                };

                variantControllers[variantIndex].done = true;

                // Check if all variants are done
                if (variantControllers.every((v) => v.done)) {
                  try {
                    controller.close();
                  } catch (e) { }
                }

                return messageWithVariant;
              } catch (error) {
                lastError = error as Error;
                console.error(
                  `[Agent-1] Variant ${variantId} attempt ${attempt + 1} failed:`,
                  error
                );
              }
            }

            // All retries exhausted for this variant
            send({
              type: "variant_failed",
              reason: "All retry attempts failed",
              error: lastError?.message || "Unknown error",
            });

            variantControllers[variantIndex].done = true;

            // Check if all variants are done
            if (variantControllers.every((v) => v.done)) {
              try {
                controller.close();
              } catch (e) { }
            }

            // Return an error message for this variant
            const errorMessage: Message = {
              role: "assistant",
              content: [{ type: "text", text: "Failed to generate response" }],
              agentId: self.id,
              variantId,
            };

            return errorMessage;
          })();

          completionPromises.push(completionPromise);
        });
      },
    });

    // Combine all completion promises
    const completions = Promise.all(completionPromises);

    return { stream, completions };
  }
}

export const agent1 = new Agent1();
