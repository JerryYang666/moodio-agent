"use client";

import { useEffect, useRef } from "react";
import { defaultLocale, locales, Locale } from "@/i18n/config";

function getLocaleFromNavigator(): Locale | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const candidates =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];

  const localeLowerMap = new Map(
    locales.map((locale) => [locale.toLowerCase(), locale])
  );
  const aliasMap: Record<string, Locale> = {
    "en-us": "en",
    "en-gb": "en",
    "en-au": "en",
    "en-ca": "en",
    "zh-CN": "zh-CN",
    "zh-cn": "zh-CN",
    "zh-hans": "zh-CN",
    "zh-sg": "zh-CN",
    "zh-Hans-CN": "zh-CN",
  };

  for (const tag of candidates) {
    if (!tag) {
      continue;
    }
    const normalized = tag.toLowerCase();
    const alias = aliasMap[normalized];
    if (alias) {
      return alias;
    }
    const exact = localeLowerMap.get(normalized);
    if (exact) {
      return exact;
    }

    const base = normalized.split("-")[0];
    const prefixMatch = locales.find((locale) => {
      const localeLower = locale.toLowerCase();
      return localeLower === base || localeLower.startsWith(`${base}-`);
    });
    if (prefixMatch) {
      return prefixMatch;
    }
  }

  return null;
}

function hasLocaleCookie(): boolean {
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith("NEXT_LOCALE="));
}

export function LocaleAutoDetect() {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) {
      return;
    }
    hasRun.current = true;

    if (hasLocaleCookie()) {
      return;
    }

    const detected = getLocaleFromNavigator() ?? defaultLocale;
    const current = document.documentElement.lang || defaultLocale;

    document.cookie = `NEXT_LOCALE=${detected};path=/;max-age=31536000`;

    if (detected !== current) {
      window.location.reload();
    }
  }, []);

  return null;
}
