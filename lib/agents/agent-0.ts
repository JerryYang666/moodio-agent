import { Agent, AgentResponse } from "./types";
import { Message, MessageContentPart } from "@/lib/llm/types";
import { ImageSize } from "@/lib/image/types";
import {
  downloadImage,
  uploadImage,
  getSignedImageUrl,
} from "@/lib/storage/s3";
import OpenAI, { toFile } from "openai";
import { getSystemPrompt } from "./system-prompts";
import { recordEvent, sanitizeOpenAIResponse } from "@/lib/telemetry";

interface Suggestion {
  title: string;
  prompt: string;
}

interface AgentOutput {
  question: string;
  suggestions: Suggestion[];
}

export class Agent0 implements Agent {
  id = "agent-0";
  name = "Creative Assistant";

  async processRequest(
    history: Message[],
    userMessage: Message,
    userId: string,
    isAdmin: boolean,
    requestStartTime?: number,
    precisionEditing?: boolean,
    imageIds?: string[], // Unified array of image IDs (not used by this agent)
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
    const client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
    });

    // 1. Prepare messages for the LLM to generate JSON
    const rawSystemPrompt = systemPromptOverride || getSystemPrompt(this.id);
    const systemPrompt = rawSystemPrompt
      .replace("{{CURRENT_DATE}}", new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));

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

    console.log(
      "[Perf] User image check completed",
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
                    url: getSignedImageUrl(c.imageId),
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

    // 2. Call LLM to get JSON
    const jsonCompletion = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: messages as any,
      response_format: { type: "json_object" },
    });

    console.log(
      "[Perf] Agent LLM response received",
      `[${Date.now() - startTime}ms]`
    );

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

    console.log("[Perf] Agent JSON parsed", `[${Date.now() - startTime}ms]`);

    const { stream, completion } = this.createStreamAndCompletion(
      parsed,
      userImageId,
      client,
      startTime,
      userId
    );
    return { stream, completion };
  }

  private createStreamAndCompletion(
    parsed: AgentOutput,
    userImageId: string | undefined,
    client: OpenAI,
    startTime: number,
    userId: string
  ) {
    const encoder = new TextEncoder();
    let controller: any = null;

    const stream = new ReadableStream({
      start(c) {
        controller = c;
        console.log(
          "[Perf] Agent output stream start",
          `[${Date.now() - startTime}ms]`
        );
        // Send text immediately
        c.enqueue(
          encoder.encode(
            JSON.stringify({ type: "text", content: parsed.question }) + "\n"
          )
        );
        console.log(
          "[Perf] Agent question sent",
          `[${Date.now() - startTime}ms]`
        );

        // Send placeholders
        if (
          Array.isArray(parsed.suggestions) &&
          parsed.suggestions.length > 0
        ) {
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

      let userImageBuffer: Buffer | null | undefined;
      if (userImageId) {
        console.log(
          "[Perf] Downloading user image",
          `[${Date.now() - startTime}ms]`
        );
        userImageBuffer = await downloadImage(userImageId);
        console.log(
          "[Perf] User image downloaded",
          `[${Date.now() - startTime}ms]`
        );
      }

      const tasks = suggestions.map(async (suggestion, index) => {
        try {
          console.log(
            `[Perf] Image generation start index=${index}`,
            `[${Date.now() - startTime}ms]`
          );
          let finalImageId: string;
          let response: any;

          if (userImageId) {
            if (!userImageBuffer)
              throw new Error("Failed to download user image");
            const file = await toFile(userImageBuffer, "image.png", {
              type: "image/png",
            });
            console.log("editing image");
            response = await client.images.edit({
              model: "gpt-image-1",
              image: file,
              prompt: suggestion.prompt,
              n: 1,
              size: "1024x1024",
            });

            const data = response.data?.[0];
            if (!data) throw new Error("No image data");

            if (data.b64_json) {
              const buf = Buffer.from(data.b64_json, "base64");
              finalImageId = await uploadImage(buf, "image/png");
            } else if (data.url) {
              const res = await fetch(data.url);
              const arrayBuf = await res.arrayBuffer();
              finalImageId = await uploadImage(
                Buffer.from(arrayBuf),
                "image/png"
              );
            } else {
              throw new Error("No image data in response");
            }
          } else {
            response = await client.images.generate({
              model: "gpt-image-1",
              prompt: suggestion.prompt,
              n: 1,
              size: "1024x1024",
            });

            const data = response.data?.[0];
            if (!data || !data.b64_json) throw new Error("No image data");

            const buf = Buffer.from(data.b64_json, "base64");
            finalImageId = await uploadImage(buf, "image/png");
          }

          // Record success event
          await recordEvent("image_generation", userId, {
            status: "success",
            provider: "openai",
            prompt: suggestion.prompt,
            response: sanitizeOpenAIResponse(response),
          });

          console.log(
            `[Perf] Image generation end index=${index}`,
            `[${Date.now() - startTime}ms]`
          );

          const part: MessageContentPart = {
            type: "agent_image",
            imageId: finalImageId,
            imageUrl: getSignedImageUrl(finalImageId),
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

          // Record failure event
          await recordEvent("image_generation", userId, {
            status: "failed",
            provider: "openai",
            error: (e as Error).message || "Image generation failed",
            prompt: suggestion.prompt,
          });

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

export const agent0 = new Agent0();
