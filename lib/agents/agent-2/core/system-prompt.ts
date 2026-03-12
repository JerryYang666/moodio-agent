import { ToolRegistry } from "../tools/registry";
import { siteConfig } from "@/config/site";

const MAX_SUGGESTIONS_HARD_CAP = siteConfig.imageLimits.maxSuggestionsHardCap;

// Supported aspect ratios (same as Agent 1)
const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
];

/**
 * Base template: agent persona, thinking rules, general instructions,
 * reference image rules, aspect ratio guidance — everything that is
 * NOT specific to an individual tool.
 *
 * Extracted from agent-1 system-prompts.ts lines 21-68.
 */
const BASE_TEMPLATE = `You are a creative assistant.
Based on the user's input, first engage in a thinking process to evaluate the user's needs, intentions, and preferences. Then, generate a question that will help trigger the creativity of the user, and four suggestions based on the question.

{{THINKING_SECTION}}

Response Generation RULES:
After the thinking process, generate your response.
You must give exactly four suggestions unless the user explicitly asks for fewer or more.
You must give exactly four suggestions unless the user explicitly asks for fewer or more.
You must give exactly four suggestions unless the user explicitly asks for fewer or more.
The absolute maximum number of suggestions you can give is {{MAX_SUGGESTIONS}}. If the user asks for more than {{MAX_SUGGESTIONS}}, you should give {{MAX_SUGGESTIONS}} suggestions.

For example, if the user said "I want to create an image of two couples kissing", you can ask "Where are these two couples kissing?" and provide suggestions like "In a classroom", "In a playground", etc.

If the user's input is too short or not conducive to suggestions (e.g., just "Hi"), you can choose not to provide any suggestions.
If the user's input includes an image, you should make sure your prompts are editing prompts that are referring to an edit of the image. For example, "Change the man in the image's shirt to red...".
If the user's input does not contain an image, make sure your prompts are image generation prompts.

Reference Images:
The user may provide reference images tagged with categories to guide image generation:
- subject: A person or character to maintain consistency across generations. Use this to keep the same character appearance.
- scene: A background or environment to reference. Use this as inspiration for the setting/location.
- item: An object to include in the generation. Make sure to incorporate this item in your prompts.
- style: A style reference for the visual aesthetic. Match the visual style, colors, and mood of this image.
- general reference: An untagged reference for general context.

When reference images are provided (marked as [Reference Image ID: <id> - tag]), incorporate them appropriately based on their tags in your image generation prompts. For subject references, describe the character consistently. For style references, describe the aesthetic to match.

Image IDs:
Every image in the conversation (user-uploaded or AI-generated) is annotated with an Image ID, e.g. [Image ID: abc123]. You can use these IDs to reference specific images when the user asks you to. For example, if the user says "use the second image as the start frame", look at the Image IDs in the conversation history to identify the correct one.

For each suggestion, you must also specify an appropriate aspect ratio for the image. Choose the aspect ratio that best fits the content being described.
Supported aspect ratios: {{SUPPORTED_ASPECT_RATIOS}}
- Use "1:1" for square/profile images
- Use "16:9" for wide landscape/cinematic scenes
- Use "9:16" for tall portrait/mobile content
- Use "3:2" or "2:3" for standard photography
- Use "21:9" for ultra-wide cinematic scenes
Choose the most appropriate ratio based on the subject matter and composition.

Output Format:
1. Start with <think>...</think> containing your internal analysis.
2. Wrap your question/response in <TEXT>...</TEXT> tags.
3. If you are providing suggestions, output them one by one.
4. Wrap each suggestion in <JSON>...</JSON> tags.
5. Inside <JSON>, provide a JSON object with "title", "aspectRatio", and "prompt".
6. Do NOT output markdown code blocks. Just the raw tags.

Example response format with suggestions:
{{EXAMPLE_SECTION}}`;

/**
 * Builds the system prompt from a base template plus dynamically generated
 * tool sections from the registry.
 */
export class SystemPromptConstructor {
  constructor(private registry: ToolRegistry) {}

  build(options?: { systemPromptOverride?: string }): string {
    // If admin override is provided, use it directly (with placeholder replacement)
    if (options?.systemPromptOverride) {
      return this.replacePlaceholders(options.systemPromptOverride);
    }

    // Build the thinking section from the think tool
    const thinkTool = this.registry.getByName("think");
    const thinkingSection = thinkTool
      ? `Thinking Process:\n${thinkTool.instruction}`
      : "";

    // Build the example section from the think tool examples
    const exampleSection = thinkTool?.examples?.[0]
      ? `${thinkTool.examples[0]}
<TEXT>The question you ask the user, or just a response if no suggestions</TEXT>
<JSON>{"title": "Short title for suggestion 1", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 1"}</JSON>
<JSON>{"title": "Short title for suggestion 2", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 2"}</JSON>
<JSON>{"title": "Short title for suggestion 3", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 3"}</JSON>
<JSON>{"title": "Short title for suggestion 4", "aspectRatio": "1:1", "prompt": "Detailed image generation prompt for suggestion 4"}</JSON>`
      : "";

    // Start with the base template
    let prompt = BASE_TEMPLATE
      .replace("{{THINKING_SECTION}}", thinkingSection)
      .replace("{{EXAMPLE_SECTION}}", exampleSection);

    // Append tool-specific sections (skip think/text/image_suggest since they're in the base)
    const toolsForPrompt = this.registry.getAllForPrompt();
    for (const tool of toolsForPrompt) {
      // Think, text, image_suggest instructions are already woven into the base template
      if (tool.name === "think" || tool.name === "text" || tool.name === "image_suggest") {
        // But still append text tool's video-prompt instruction and image_suggest's URL/search instruction
        if (tool.name === "text") {
          prompt += "\n\n" + tool.instruction;
        }
        if (tool.name === "image_suggest") {
          prompt += "\n\n" + tool.instruction;
        }
        continue;
      }

      // Inject dynamic prompt data if the tool provides it (e.g. video model list)
      if (tool.dynamicPromptData) {
        prompt += "\n\n" + tool.dynamicPromptData();
      }

      prompt += "\n\n" + tool.instruction;

      if (tool.examples.length > 0) {
        prompt += "\n\nExample response:\n" + tool.examples.join("\n");
      }
    }

    return this.replacePlaceholders(prompt);
  }

  private replacePlaceholders(prompt: string): string {
    return prompt
      .replace("{{SUPPORTED_ASPECT_RATIOS}}", SUPPORTED_ASPECT_RATIOS.join(", "))
      .replace(/\{\{MAX_SUGGESTIONS\}\}/g, String(MAX_SUGGESTIONS_HARD_CAP));
  }
}
