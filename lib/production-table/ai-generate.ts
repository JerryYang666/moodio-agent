import { createLLMClient } from "@/lib/llm/client";

interface GenerateRowsInput {
  columnNames: string[];
  scriptText: string;
}

interface GeneratedRow {
  [columnName: string]: string;
}

/**
 * Use the LLM to break a film script into production-table rows.
 * Only text columns are filled; media columns are left for the user.
 * Returns an array of row objects keyed by column name.
 */
export async function generateRowsFromScript(
  input: GenerateRowsInput
): Promise<GeneratedRow[]> {
  const { columnNames, scriptText } = input;

  const systemPrompt = `You are a professional film production assistant.
You will receive a film script or screenplay text and a list of production table column names.
Your job is to break the script into individual shots/scenes and fill in each column for every shot.

RULES:
- Analyze the script carefully and create one row per shot/scene.
- Each row must have a value for every column listed.
- For the shot number column, use sequential numbers starting from 1.
- CRITICAL: Detect the language of the script and write ALL cell values in that same language. If the script is in Chinese, respond in Chinese. If in Korean, respond in Korean. If in Japanese, respond in Japanese. Always match the script's language exactly.
- For description columns, write concise but informative text.
- If the script does not contain enough information for a column, make a reasonable professional inference or leave a short placeholder like "-".
- Return ONLY valid JSON with no markdown fencing, no explanation.
- The response must be a JSON object: { "rows": [ { "columnName": "value", ... }, ... ] }
- Column names in the output must match the provided column names exactly (column names stay as given; only cell values follow the script language).`;

  const userPrompt = `Column names: ${JSON.stringify(columnNames)}

Script text:
${scriptText}`;

  const llm = createLLMClient();
  const raw = await llm.chatComplete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      responseFormat: { type: "json_object" },
    }
  );

  return parseGeneratedRows(raw, columnNames);
}

function parseGeneratedRows(
  raw: string,
  columnNames: string[]
): GeneratedRow[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: { rows?: GeneratedRow[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*"rows"\s*:\s*\[[\s\S]*\]\s*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error("Failed to parse AI response as JSON");
    }
  }

  if (!Array.isArray(parsed.rows)) {
    throw new Error("AI response missing 'rows' array");
  }

  return parsed.rows.map((row) => {
    const normalized: GeneratedRow = {};
    for (const col of columnNames) {
      normalized[col] = typeof row[col] === "string" ? row[col] : String(row[col] ?? "");
    }
    return normalized;
  });
}
