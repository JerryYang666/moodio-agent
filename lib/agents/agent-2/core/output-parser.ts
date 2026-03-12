import { ToolRegistry } from "../tools/registry";

/**
 * Represents a fully parsed XML tag from the LLM output.
 */
export interface ParsedTag {
  toolName: string;
  tag: string;
  rawContent: string;
  parsedContent: any;
}

/**
 * Registry-driven tag parser that replaces the hardcoded VALID_TAGS array
 * and individual parse functions from Agent 1.
 *
 * Uses the tool registry to know which tags to look for, making it
 * automatically aware of newly registered tools.
 */
export class OutputParser {
  private buffer: string = "";
  private validTags: string[];

  constructor(private registry: ToolRegistry) {
    this.validTags = registry.getAllTags();
  }

  /** Feed a new chunk of LLM output into the parser. */
  feed(chunk: string): void {
    this.buffer += chunk;
  }

  /** Get the current buffer contents (for external inspection). */
  getBuffer(): string {
    return this.buffer;
  }

  /** Replace the buffer (used after tag extraction or tool call restart). */
  setBuffer(newBuffer: string): void {
    this.buffer = newBuffer;
  }

  /**
   * Validate that no non-whitespace text appears outside known XML tags.
   * Throws if invalid content is found.
   * Ported from parse-agent-output.ts validateBufferTags().
   */
  validateBuffer(): void {
    let insideTag = false;
    let inAngleBrackets = false;
    let i = 0;

    while (i < this.buffer.length) {
      const remaining = this.buffer.substring(i);

      let tagMatched = false;
      for (const tag of this.validTags) {
        const open = `<${tag}>`;
        const close = `</${tag}>`;
        if (remaining.startsWith(open)) {
          insideTag = true;
          i += open.length;
          tagMatched = true;
          break;
        }
        if (remaining.startsWith(close)) {
          insideTag = false;
          i += close.length;
          tagMatched = true;
          break;
        }
      }
      if (tagMatched) continue;

      const char = this.buffer[i];
      if (char === "<") {
        inAngleBrackets = true;
      } else if (char === ">") {
        inAngleBrackets = false;
      } else if (!insideTag && !inAngleBrackets && char.trim() !== "") {
        throw new Error(
          `Invalid LLM response: text outside tags at position ${i}`
        );
      }

      i++;
    }
  }

  /**
   * Extract all fully-closed tags from the buffer.
   * Returns an array of parsed tags and advances the buffer past them.
   */
  extractCompleteTags(): ParsedTag[] {
    const results: ParsedTag[] = [];

    for (const tag of this.validTags) {
      const open = `<${tag}>`;
      const close = `</${tag}>`;

      // Handle multiple occurrences of the same tag (e.g. multiple <IMAGE> blocks)
      while (this.buffer.includes(close)) {
        const start = this.buffer.indexOf(open);
        const end = this.buffer.indexOf(close);
        if (start === -1 || end === -1 || start >= end) break;

        const rawContent = this.buffer.substring(start + open.length, end);
        const rest = this.buffer.substring(end + close.length);

        const toolDef = this.registry.getByTag(tag);
        if (!toolDef) break;

        let parsedContent: any;
        try {
          if (toolDef.parseContent) {
            parsedContent = toolDef.parseContent(rawContent);
          } else {
            parsedContent = JSON.parse(rawContent);
          }
        } catch (e) {
          // If parsing fails, store the raw content and let the executor handle it
          parsedContent = rawContent;
        }

        results.push({
          toolName: toolDef.name,
          tag,
          rawContent,
          parsedContent,
        });

        this.buffer = rest;
      }
    }

    return results;
  }

  /**
   * Check if a specific tag's opening tag is present in the buffer
   * (even if the closing tag hasn't arrived yet).
   */
  hasOpenTag(tag: string): boolean {
    return this.buffer.includes(`<${tag}>`);
  }
}
