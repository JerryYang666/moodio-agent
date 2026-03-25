import fs from "fs/promises";
import path from "path";
import { notFound } from "next/navigation";
import { ChinaLegalPageClient } from "./client";

const SLUG_TO_FILE: Record<string, string> = {
  terms: "china-terms-of-service.md",
  privacy: "china-privacy-policy.md",
  "ai-labeling": "china-ai-labeling-policy.md",
  "real-name": "china-real-name-policy.md",
};

/** Map China doc slugs to their corresponding global English doc slug (if any) */
const CN_TO_EN_SLUG: Record<string, string> = {
  terms: "terms",
  privacy: "privacy",
};

export function generateStaticParams() {
  return Object.keys(SLUG_TO_FILE).map((slug) => ({ slug }));
}

export default async function ChinaLegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const filename = SLUG_TO_FILE[slug];

  if (!filename) {
    notFound();
  }

  const filePath = path.join(process.cwd(), "legal", "published", filename);
  let content: string;

  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    notFound();
  }

  const englishSlug = CN_TO_EN_SLUG[slug] ?? null;

  return <ChinaLegalPageClient content={content} englishSlug={englishSlug} />;
}
