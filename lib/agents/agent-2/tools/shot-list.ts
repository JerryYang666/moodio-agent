import { ToolDefinition } from "./types";

export const shotListTool: ToolDefinition = {
  name: "shot_list",
  tag: "SHOTLIST",
  description: "Shot list / shot-by-shot production planning table",
  instruction: `When the user asks for a shot list, shot-by-shot design, shot breakdown, or production planning for a film, short film, commercial, or any video project, you should output a structured shot list table using the <SHOTLIST> tag.

The <SHOTLIST> tag must contain a single JSON object with:
- "title": A descriptive title for the shot list
- "columns": An array of column header strings. Use these columns: ["Shot #", "Description", "Framing", "Camera Movement", "Location", "Notes"]
- "rows": An array of row objects, each with "id" (e.g. "row-1", "row-2") and "cells" (an array of cell objects with "value" strings, one per column)

Rules for shot list creation:
1. Only output a <SHOTLIST> tag when the user explicitly asks for a shot list, shot-by-shot design, or production planning.
2. You MUST also include a <TEXT> response before the <SHOTLIST> explaining what you've created.
3. Do NOT output <JSON> image suggestions or <VIDEO> when outputting a <SHOTLIST> tag.
4. Generate a professional, detailed shot list appropriate for the described project.
5. Include 8-15 shots for a typical short film request. Adjust based on the complexity described.
6. Each cell value should be concise but descriptive enough for production use.`,
  examples: [
    `<SHOTLIST>{"title": "Night Agent - Hotel Infiltration", "columns": ["Shot #", "Description", "Framing", "Camera Movement", "Location", "Notes"], "rows": [{"id": "row-1", "cells": [{"value": "1"}, {"value": "Agent approaches hotel exterior at night"}, {"value": "Wide shot"}, {"value": "Slow dolly in"}, {"value": "Hotel exterior"}, {"value": "Establish mood, dark atmosphere"}]}, {"id": "row-2", "cells": [{"value": "2"}, {"value": "Agent enters through side door"}, {"value": "Medium shot"}, {"value": "Handheld follow"}, {"value": "Hotel side entrance"}, {"value": "Tension building"}]}]}</SHOTLIST>`,
  ],
  waitForOutput: false,
  onOpenTag: (ctx) => {
    ctx.send({ type: "shot_list_start" });
    console.log("[Perf] Agent shot list generation started", `[${Date.now() - ctx.requestStartTime}ms]`);
  },
  createPart: (parsed: any) => ({
    type: "agent_shot_list" as const,
    title: parsed.title || "Shot List",
    columns: Array.isArray(parsed.columns) ? parsed.columns : [],
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    status: "complete" as const,
  }),
};
