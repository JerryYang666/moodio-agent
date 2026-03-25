"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import NextLink from "next/link";
import { Button } from "@heroui/button";

const COOKIE_NAME = "moodio_cc";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

export const CookieConsentBanner = () => {
  const t = useTranslations("legal");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    setCookie(COOKIE_NAME, "1", 365);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4">
      <div className="max-w-xl mx-auto bg-content1 border border-divider rounded-xl shadow-lg p-4 flex flex-col sm:flex-row items-center gap-3">
        <p className="text-sm text-default-600 flex-1">
          {t("cookieBannerText")}{" "}
          <NextLink
            href="/legal/cookies"
            className="text-primary underline"
          >
            {t("cookiePolicyLink")}
          </NextLink>
          .
        </p>
        <Button
          color="primary"
          size="sm"
          onPress={handleAccept}
          className="shrink-0"
        >
          {t("cookieAccept")}
        </Button>
      </div>
    </div>
  );
};
