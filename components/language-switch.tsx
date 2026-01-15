"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { Languages } from "lucide-react";
import { locales, localeNames, Locale } from "@/i18n/config";

export function LanguageSwitch() {
  const t = useTranslations("language");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: Locale) => {
    startTransition(() => {
      // Set the locale cookie
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`;
      // Reload the page to apply the new locale
      window.location.reload();
    });
  };

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button
          isIconOnly
          variant="light"
          aria-label={t("switchLanguage")}
          isLoading={isPending}
        >
          <Languages size={20} />
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t("switchLanguage")}
        selectionMode="single"
        selectedKeys={new Set([locale])}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as Locale;
          if (selected && selected !== locale) {
            handleLocaleChange(selected);
          }
        }}
      >
        {locales.map((loc) => (
          <DropdownItem key={loc}>{localeNames[loc]}</DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}
