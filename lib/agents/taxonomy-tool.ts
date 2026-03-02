import type { Property, PropertyValue } from "@/lib/redux/services/api";

const FLASK_URL = process.env.NEXT_PUBLIC_FLASK_URL || "";

export interface TaxonomyToolCall {
  tool: "CHECK_TAXONOMY";
  lang: string;
}

/**
 * Fetch the full taxonomy property tree from the Flask API.
 */
export async function fetchTaxonomyTree(lang: string): Promise<Property[]> {
  const url = `${FLASK_URL}/api/properties?lang=${encodeURIComponent(lang)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch taxonomy tree: ${res.status} ${res.statusText}`);
  }
  await new Promise((r) => setTimeout(r, 1000)); // TODO: remove — artificial delay for UI testing
  return res.json();
}

/**
 * Serialize the taxonomy tree into a compact text format for the LLM context window.
 *
 * Output format:
 *   ## Camera Movement
 *     - [id:42] Dolly Zoom
 *     - [id:43] Pan
 *     ### Sub-category
 *       - [id:44] Tracking Shot
 *
 * Only non-hidden items are included.
 */
export function serializeTaxonomyForLLM(properties: Property[]): string {
  const lines: string[] = [];

  function serializeNode(node: Property, depth: number): void {
    if (node.hidden || node.effective_hidden) return;

    const indent = "  ".repeat(depth);

    if (node.name) {
      const prefix = "#".repeat(Math.min(depth + 2, 6));
      lines.push(`${indent}${prefix} ${node.name}`);
    } else if (node.value) {
      const desc = (node as any).description;
      lines.push(`${indent}- [id:${node.id}] ${node.value}${desc ? ` — ${desc}` : ""}`);
    }

    for (const value of node.values) {
      if (value.hidden || value.effective_hidden) continue;
      lines.push(`${indent}  - [id:${value.id}] ${value.value}${value.description ? ` — ${value.description}` : ""}`);
    }

    for (const child of node.children) {
      serializeNode(child, depth + 1);
    }
  }

  for (const root of properties) {
    serializeNode(root, 0);
  }

  return lines.join("\n");
}

/**
 * Parse the JSON body of a <TOOL_CALL> tag into a structured tool call.
 */
export function parseToolCallBody(jsonStr: string): TaxonomyToolCall {
  const parsed = JSON.parse(jsonStr);
  return {
    tool: parsed.tool,
    lang: typeof parsed.lang === "string" ? parsed.lang : "en",
  };
}
