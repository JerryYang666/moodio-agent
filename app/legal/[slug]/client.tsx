"use client";

import NextLink from "next/link";
import { useTranslations } from "next-intl";
import MarkdownRenderer from "@/components/ui/markdown-renderer";
import { LegalFooter } from "@/components/legal-footer";

export function LegalPageClient({
  content,
  chinaSlug,
}: {
  content: string;
  chinaSlug: string | null;
}) {
  const t = useTranslations("legal");

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 prose prose-neutral dark:prose-invert max-w-3xl mx-auto px-6 py-12 w-full">
        <div className="mb-8 flex items-center justify-between">
          <NextLink
            href="/"
            className="text-sm text-primary hover:underline no-underline"
          >
            &larr; {t("backToHome")}
          </NextLink>
          {chinaSlug && (
            <NextLink
              href={`/legal/cn/${chinaSlug}`}
              className="text-sm text-primary hover:underline no-underline"
            >
              中文版本
            </NextLink>
          )}
        </div>
        <MarkdownRenderer>{content}</MarkdownRenderer>
      </div>
      <LegalFooter className="max-w-3xl mx-auto px-6 pb-8" />
    </div>
  );
}
