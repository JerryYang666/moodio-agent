import { Agent, AgentResponse } from "./types";
import { Message, MessageContentPart } from "@/lib/llm/types";
import { downloadImage, uploadImage } from "@/lib/storage/s3";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from "uuid";

interface Suggestion {
  title: string;
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
    userId: string
  ): Promise<AgentResponse> {
    const client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    });

    // 1. Prepare messages for the LLM to generate JSON
    const systemPrompt = `You are a creative assistant.
Based on the user's input, generate a question that will help trigger the creativity of the user, and four suggestions based on the question.
For example, if the user said "I want to create an image of two couples kissing", you can ask "Where are these two couples kissing?" and provide suggestions like "In a classroom", "In a playground", etc.

If the user's input is too short or not conducive to suggestions (e.g., just "Hi"), you can choose not to provide any suggestions.
If the user's input includes an image, you should make sure your prompts are editing prompts that are referring to an edit of the image. For example, "Change the man in the image's shirt to red...".

You must output a JSON object with the following structure:
{
  "question": "The question you ask the user, or just a response if no suggestions",
  "suggestions": [
    { "title": "Short title for suggestion 1", "prompt": "Detailed image generation prompt for suggestion 1" },
    { "title": "Short title for suggestion 2", "prompt": "Detailed image generation prompt for suggestion 2" },
    { "title": "Short title for suggestion 3", "prompt": "Detailed image generation prompt for suggestion 3" },
    { "title": "Short title for suggestion 4", "prompt": "Detailed image generation prompt for suggestion 4" }
  ]
}
Note: "suggestions" can be an empty array [] if no suggestions are appropriate.
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
                text: `Suggestion: ${p.title}\nPrompt: ${p.prompt}`,
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

    // 2. Call LLM to get JSON
    const jsonCompletion = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: messages as any,
      response_format: { type: "json_object" },
    });

    const content = jsonCompletion.choices[0].message.content;
    if (!content) {
      throw new Error("No content received from LLM");
    }

    let parsed: AgentOutput;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse JSON", e);
      parsed = {
        question: content,
        suggestions: [],
      };
    }

    const { stream, completion } = this.createStreamAndCompletion(
      parsed,
      userImageId
    );
    return { stream, completion };
  }

  private createStreamAndCompletion(
    parsed: AgentOutput,
    userImageId: string | undefined
  ) {
    const encoder = new TextEncoder();
    let controller: any = null;

    const stream = new ReadableStream({
      start(c) {
        controller = c;
        // Send text immediately
        c.enqueue(
          encoder.encode(
            JSON.stringify({ type: "text", content: parsed.question }) + "\n"
          )
        );

        // Send placeholders
        if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
          parsed.suggestions.forEach((s) => {
            c.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "part",
                  part: {
                    type: "agent_image",
                    title: s.title,
                    prompt: s.prompt,
                    status: "loading",
                  },
                }) + "\n"
              )
            );
          });
        }
      },
    });

    const completion = (async () => {
      const suggestions = parsed.suggestions || [];
      const finalContent: MessageContentPart[] = [
        { type: "text", text: parsed.question },
        ...suggestions.map(
          (s) =>
            ({
              type: "agent_image",
              title: s.title,
              prompt: s.prompt,
              status: "loading",
            }) as MessageContentPart
        ),
      ];

      if (suggestions.length === 0) {
        if (controller) {
          try {
            controller.close();
          } catch (e) {
            // Ignore error if already closed
          }
        }
        return {
          role: "assistant" as const,
          content: finalContent,
          agentId: this.id,
        };
      }

      let userImageBase64: string | undefined;
      if (userImageId) {
        const buffer = await downloadImage(userImageId);
        if (buffer) {
          userImageBase64 = buffer.toString("base64");
        }
      }

      const tasks = suggestions.map(async (suggestion, index) => {
        try {
          let finalImageId: string;
          const ai = new GoogleGenAI({
            apiKey: process.env.GOOGLE_API_KEY,
          });

          if (userImageId) {
            // Image editing with Gemini (text-and-image-to-image)
            if (!userImageBase64) throw new Error("Failed to download user image");
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
            });

            let generatedImageData: string | undefined;
            const candidates = (response as any).candidates;
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
              console.log("[Agent-1] No image data in Gemini response (image editing). Full response:", JSON.stringify(response, null, 2));
              throw new Error("No image data in Gemini response");
            }

            const buf = Buffer.from(generatedImageData, "base64");
            finalImageId = await uploadImage(buf, "image/png");
          } else {
            // Image generation with Gemini (text-to-image)
            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash-image",
              contents: suggestion.prompt,
            });

            let generatedImageData: string | undefined;
            const candidates = (response as any).candidates;
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
              console.log("[Agent-1] No image data in Gemini response (text-to-image). Full response:", JSON.stringify(response, null, 2));
              throw new Error("No image data in Gemini response");
            }

            const buf = Buffer.from(generatedImageData, "base64");
            finalImageId = await uploadImage(buf, "image/png");
          }

          const part: MessageContentPart = {
            type: "agent_image",
            imageId: finalImageId,
            title: suggestion.title,
            prompt: suggestion.prompt,
            status: "generated",
          };

          // Update stream
          if (controller) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "part_update",
                  index: index,
                  part: part,
                }) + "\n"
              )
            );
          }

          finalContent[index + 1] = part;
        } catch (e) {
          console.error(e);
          const part: MessageContentPart = {
            type: "agent_image",
            title: suggestion.title,
            prompt: suggestion.prompt,
            status: "error",
          };
          if (controller) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "part_update",
                  index: index,
                  part: part,
                }) + "\n"
              )
            );
          }
          finalContent[index + 1] = part;
        }
      });

      await Promise.all(tasks);
      if (controller) controller.close();

      return {
        role: "assistant" as const,
        content: finalContent,
        agentId: this.id,
      };
    })();

    return { stream, completion };
  }
}

export const agent1 = new Agent1();

