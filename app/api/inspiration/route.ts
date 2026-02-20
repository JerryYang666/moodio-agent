import { NextRequest, NextResponse } from "next/server";
import { createLLMClient } from "@/lib/llm/client";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";

export async function GET(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const locale = new URL(req.url).searchParams.get("locale") || "en";

    const localeNames: Record<string, string> = {
      en: "English",
      "zh-CN": "Simplified Chinese",
      "zh-TW": "Traditional Chinese",
      ja: "Japanese",
      ko: "Korean",
    };
    const languageName = localeNames[locale] || "English";

    const client = createLLMClient({ model: "gpt-4o" });
    const prompt =
      `Generate a short 1-3 word highly artistic, beautiful, and visually striking search term for an inspiration gallery (e.g., 'cinematic glowing landscapes', 'abstract fluid gradients', 'ethereal lighting'). Do not use mundane or basic terms. Reply in ${languageName}. Output only the term, no quotes, no extra text.`;

    const response = await client.chatComplete([
      { role: "user", content: prompt },
    ]);

    // Remove any quotes that the LLM might still generate
    const cleanTerm = response.trim().replace(/^["'](.*)["']$/, '$1');

    return NextResponse.json({ term: cleanTerm });
  } catch (error) {
    console.error("Error generating inspiration term:", error);
    return NextResponse.json(
      { error: "Failed to generate inspiration term" },
      { status: 500 }
    );
  }
}
