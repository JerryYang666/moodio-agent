import { ToolHandler, ToolResult } from "../tool-executor";
import { ParsedTag } from "../../core/output-parser";
import { RequestContext } from "../../context";
import {
  fetchTaxonomyTree,
  serializeTaxonomyForLLM,
} from "@/lib/agents/taxonomy-tool";

/**
 * Handler for the CHECK_TAXONOMY tool call.
 * Fetches the taxonomy tree and returns serialized data for injection
 * back into the conversation (waitForOutput = true).
 */
export class CheckTaxonomyHandler implements ToolHandler {
  async execute(parsedTag: ParsedTag, ctx: RequestContext): Promise<ToolResult> {
    const parsed = parsedTag.parsedContent;

    // Validate it's actually a CHECK_TAXONOMY call
    if (typeof parsed === "object" && parsed.tool !== "CHECK_TAXONOMY") {
      return {
        success: false,
        error: `Unknown tool call: ${parsed.tool}`,
      };
    }

    const lang = typeof parsed?.lang === "string" ? parsed.lang : "en";

    console.log(
      `[Agent-2] Tool call detected: CHECK_TAXONOMY lang=${lang}`,
      `[${Date.now() - ctx.requestStartTime}ms]`
    );

    // Emit loading status
    ctx.send({ type: "tool_call", tool: "check_taxonomy", status: "loading" });

    try {
      const taxonomyTree = await fetchTaxonomyTree(lang);
      const serialized = serializeTaxonomyForLLM(taxonomyTree);

      console.log(
        `[Agent-2] Taxonomy tree fetched: ${serialized.length} chars`,
        `[${Date.now() - ctx.requestStartTime}ms]`
      );

      // Emit complete status
      ctx.send({ type: "tool_call", tool: "check_taxonomy", status: "complete" });

      return {
        success: true,
        data: {
          serializedTaxonomy: serialized,
        },
        contentParts: [
          { type: "tool_call", tool: "check_taxonomy", status: "complete" },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[Agent-2] Taxonomy fetch failed:", error);

      ctx.send({ type: "tool_call", tool: "check_taxonomy", status: "error" });

      return {
        success: false,
        error: errorMessage,
        contentParts: [
          { type: "tool_call", tool: "check_taxonomy", status: "error" },
        ],
      };
    }
  }
}
