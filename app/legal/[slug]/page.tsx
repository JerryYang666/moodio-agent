import fs from "fs/promises";
import path from "path";
import { notFound } from "next/navigation";
import { LegalPageClient } from "./client";

const SLUG_TO_FILE: Record<string, string> = {
  terms: "terms-of-service.md",
  privacy: "privacy-policy.md",
  "acceptable-use": "acceptable-use-policy.md",
  dmca: "dmca-copyright-policy.md",
  cookies: "cookie-policy.md",
  "community-guidelines": "community-guidelines.md",
  "subscription-terms": "subscription-credit-terms.md",
  refunds: "refund-policy.md",
};

/** Slugs that have a corresponding China version */
const EN_TO_CN_SLUG: Record<string, string> = {
  terms: "terms",
  privacy: "privacy",
};

export function generateStaticParams() {
  return Object.keys(SLUG_TO_FILE).map((slug) => ({ slug }));
}

export default async function LegalPage({
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

  const chinaSlug = EN_TO_CN_SLUG[slug] ?? null;

  return <LegalPageClient content={content} chinaSlug={chinaSlug} />;
}
