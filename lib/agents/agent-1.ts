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
    const client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    });

    // 1. Prepare messages
    const systemPrompt = `You are a creative assistant.
Based on the user's input, generate a question that will help trigger the creativity of the user, and four suggestions based on the question.
For example, if the user said "I want to create an image of two couples kissing", you can ask "Where are these two couples kissing?" and provide suggestions like "In a classroom", "In a playground", etc.

If the user's input is too short or not conducive to suggestions (e.g., just "Hi"), you can choose not to provide any suggestions.
If the user's input includes an image, you should make sure your prompts are editing prompts that are referring to an edit of the image. For example, "Change the man in the image's shirt to red...".

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

    // 2. Call LLM with stream
    const llmStream = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: messages as any,
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
        let questionSent = false;
        let hasSentPlaceholders = false;
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

            // 2. Send Placeholders if we detect suggestions starting
            if (
              questionSent &&
              !hasSentPlaceholders &&
              (buffer.includes("<JSON>") || buffer.includes("<JSON"))
            ) {
              // Only send if we are fairly sure suggestions are coming.
              // Checking for <JSON is a bit eager but helps speed.
              // Let's wait for full <JSON> to be safe against hallucinations or partials,
              // OR just wait for <JSON>
              if (buffer.includes("<JSON>")) {
                const placeholders = Array(4)
                  .fill(null)
                  .map((_, i) => ({
                    type: "agent_image" as const,
                    title: "Loading...",
                    aspectRatio: "1:1" as const,
                    prompt: "",
                    status: "loading" as const,
                  }));

                placeholders.forEach((p) => {
                  send({ type: "part", part: p });
                  finalContent.push(p);
                });
                hasSentPlaceholders = true;
              }
            }

            // 3. Parse Suggestions
            while (buffer.includes("</JSON>")) {
              const sStart = buffer.indexOf("<JSON>");
              const sEnd = buffer.indexOf("</JSON>");

              if (sStart !== -1 && sEnd !== -1) {
                if (sStart < sEnd) {
                  const jsonStr = buffer.substring(sStart + 6, sEnd);
                  try {
                    const suggestion = JSON.parse(jsonStr);
                    const currentIndex = suggestionIndex;
                    suggestionIndex++;

                    // Start image generation
                    const task = (async () => {
                      try {
                        console.log(
                          "[Perf] Agent image generation start",
                          `[${Date.now() - startTime}ms]`
                        );
                        const part = await self.generateImage(
                          suggestion,
                          userImageId,
                          userImageBase64Promise,
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
