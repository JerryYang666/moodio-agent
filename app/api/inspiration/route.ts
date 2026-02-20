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

    const now = new Date();
    const timestampStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    // Two independent word sets for seeding creative direction
    const moodWords = ["ethereal", "melancholic", "serene", "surreal", "ancient", "futuristic", "mystical", "raw", "luminous", "haunting"];
    const subjectWords = ["forest", "ocean", "metropolis", "desert", "cosmos", "ruins", "glacier", "blossom", "storm", "silence"];

    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const mood = pick(moodWords);
    const subject = pick(subjectWords);

    const client = createLLMClient({ model: "gpt-4o" });
    const prompt =
      `The current timestamp is ${timestampStr}. Use this as a unique seed for randomness. You are given two creative direction words: mood="${mood}", subject="${subject}". Inspired by these two words, generate a short 1-3 word highly artistic, beautiful, and visually striking search term for an inspiration gallery. Do not output the seed words themselves verbatim — let them guide the feeling and direction. Do not use mundane or basic terms. Reply in ${languageName}. Output only the term, no quotes, no extra text.`;

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
