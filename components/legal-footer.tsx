"use client";

import NextLink from "next/link";
import { useTranslations } from "next-intl";

interface LegalFooterProps {
  className?: string;
}

export const LegalFooter = ({ className }: LegalFooterProps) => {
  const t = useTranslations("legal");

  const links = [
    { href: "/legal/terms", label: t("terms") },
    { href: "/legal/privacy", label: t("privacy") },
    { href: "/legal/cookies", label: t("cookies") },
    { href: "/legal/dmca", label: t("dmca") },
  ];

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-3 justify-center text-xs text-default-400">
        {links.map((link) => (
          <NextLink
            key={link.href}
            href={link.href}
            className="hover:text-default-600 transition-colors"
          >
            {link.label}
          </NextLink>
        ))}
      </div>
    </div>
  );
};
