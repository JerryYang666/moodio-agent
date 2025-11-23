import { Agent, AgentResponse } from "./types";
import { Message, MessageContentPart } from "@/lib/llm/types";
import { downloadImage, uploadImage } from "@/lib/storage/s3";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from "uuid";

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
}

export class Agent1 implements Agent {
  id = "agent-1";
  name = "Creative Assistant (Gemini)";

  async processRequest(
    history: Message[],
    userMessage: Message,
    userId: string,
    requestStartTime?: number
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
      startTime
    );

    // Step 2: Call LLM and parse response
    const { stream, completion } = await this.callLLMAndParse(
      prepared,
      startTime
    );

    return { stream, completion };
  }

  private async prepareMessages(
    history: Message[],
    userMessage: Message,
    startTime: number
  ): Promise<PreparedMessages> {
    const systemPrompt = `You are a creative assistant.
Based on the user's input, generate a question that will help trigger the creativity of the user, and four suggestions based on the question. You must give exactly four suggestions unless the user explicitly asks for fewer or more.
The absolute maximum number of suggestions you can give is eight (8). If the user asks for more than eight, you should give eight suggestions.
The absolute maximum number of suggestions you can give is eight (8). If the user asks for more than eight, you should give eight suggestions.
For example, if the user said "I want to create an image of two couples kissing", you can ask "Where are these two couples kissing?" and provide suggestions like "In a classroom", "In a playground", etc.

If the user's input is too short or not conducive to suggestions (e.g., just "Hi"), you can choose not to provide any suggestions.
If the user's input includes an image, you should make sure your prompts are editing prompts that are referring to an edit of the image. For example, "Change the man in the image's shirt to red...".
If the user's input does not contain an image, make sure your prompts are image generation prompts.

For each suggestion, you must also specify an appropriate aspect ratio for the image. Choose the aspect ratio that best fits the content being described.
Supported aspect ratios: ${SUPPORTED_ASPECT_RATIOS.join(", ")}
- Use "1:1" for square/profile images
- Use "16:9" for wide landscape/cinematic scenes
- Use "9:16" for tall portrait/mobile content
- Use "3:2" or "2:3" for standard photography
- Use "21:9" for ultra-wide cinematic scenes
Choose the most appropriate ratio based on the subject matter and composition.

Output Format:
1. Wrap your question/response in <TEXT>...</TEXT> tags.
2. If you are providing suggestions, output them one by one.
3. Wrap each suggestion in <JSON>...</JSON> tags.
4. Inside <JSON>, provide a JSON object with "title", "aspectRatio", and "prompt".
5. Do NOT output markdown code blocks. Just the raw tags.

Example with suggestions:
<TEXT>The question you ask the user, or just a response if no suggestions</TEXT>
<JSON>{"title": "Short title for suggestion 1", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 1"}</JSON>
<JSON>{"title": "Short title for suggestion 2", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 2"}</JSON>
<JSON>{"title": "Short title for suggestion 3", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 3"}</JSON>
<JSON>{"title": "Short title for suggestion 4", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 4"}</JSON>

Example without suggestions:
<TEXT>Hello! How can I help you today?</TEXT>
`;

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

    console.log(
      "[Perf] User image base64 prepared",
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
                  url: `${process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL}/${p.imageId}`,
                },
              };
            }
            return p;
          })
        : userMessage.content,
    };

    const messages = [
      { role: "system", content: systemPrompt },
      ...cleanHistory.map((m) => {
        if (Array.isArray(m.content)) {
          return {
            role: m.role,
            content: m.content.map((c) => {
              if (c.type === "image")
                return {
                  type: "image_url",
                  image_url: {
                    url: `${process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL}/${c.imageId}`,
                  },
                };
              return c;
            }),
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

    return { messages, userImageId, userImageBase64Promise };
  }

  private async callLLMAndParse(
    prepared: PreparedMessages,
    startTime: number
  ): Promise<AgentResponse> {
    const client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    });

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

    const encoder = new TextEncoder();
    let resolveCompletion: (value: Message) => void;
    const completion = new Promise<Message>((resolve) => {
      resolveCompletion = resolve;
    });

    // Track final content for completion
    const finalContent: MessageContentPart[] = [];
    const self = this;

    const stream = new ReadableStream({
      async start(controller) {
        console.log(
          "[Perf] Agent output stream start",
          `[${Date.now() - startTime}ms]`
        );
        let buffer = "";
        let fullLlmResponse = ""; // Track complete LLM response
        let questionSent = false;
        let suggestionIndex = 0;
        const imageTasks: Promise<void>[] = [];

        const send = (data: any) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          } catch (e) {
            // Controller might be closed
          }
        };

        try {
          for await (const chunk of llmStream) {
            const delta = chunk.choices[0]?.delta?.content || "";
            buffer += delta;
            fullLlmResponse += delta; // Accumulate full response

            // 1. Parse Question
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
                          prepared.userImageId,
                          prepared.userImageBase64Promise,
                          currentIndex,
                          startTime
                        );

                        // Send update
                        send({
                          type: "part_update",
                          index: currentIndex,
                          part: part,
                        });

                        // Update final content (index + 1 because of text part)
                        finalContent[currentIndex + 1] = part;
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
                        finalContent[currentIndex + 1] = errorPart;
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

          resolveCompletion({
            role: "assistant",
            content: finalContent,
            agentId: "agent-1",
          });
          controller.close();
        } catch (err) {
          console.error("Stream processing error", err);
          resolveCompletion({
            role: "assistant",
            content: [{ type: "text", text: "Error processing request." }],
            agentId: "agent-1",
          });
          try {
            controller.close();
          } catch (e) {}
        }
      },
    });

    return { stream, completion };
  }

  private async generateImage(
    suggestion: Suggestion,
    userImageId: string | undefined,
    userImageBase64Promise: Promise<string | undefined>,
    index: number,
    startTime: number
  ): Promise<MessageContentPart> {
    console.log(
      `[Perf] Image generation start index=${index}`,
      `[${Date.now() - startTime}ms]`
    );
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY,
    });

    const aspectRatio: AspectRatio = SUPPORTED_ASPECT_RATIOS.includes(
      suggestion.aspectRatio as AspectRatio
    )
      ? (suggestion.aspectRatio as AspectRatio)
      : "1:1";

    let finalImageId: string;
    const userImageBase64 = await userImageBase64Promise;

    if (userImageId && userImageBase64) {
      // Image editing
      const prompt = [
        { text: suggestion.prompt },
        {
          inlineData: {
            mimeType: "image/png",
            data: userImageBase64,
          },
        },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: prompt,
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          },
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
        model: "gemini-2.5-flash-image",
        contents: suggestion.prompt,
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          },
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
