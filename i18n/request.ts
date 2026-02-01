import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, locales, Locale } from "./config";
import deepmerge from "deepmerge";

export default getRequestConfig(async () => {
  // Get locale from cookie, default to 'en'
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;

  // Validate locale
  const locale: Locale = locales.includes(localeCookie as Locale)
    ? (localeCookie as Locale)
    : defaultLocale;

  // Load default (English) messages as fallback
  const defaultMessages = (await import(`../messages/${defaultLocale}.json`))
    .default;

  // Load locale-specific messages
  const localeMessages =
    locale !== defaultLocale
      ? (await import(`../messages/${locale}.json`)).default
      : defaultMessages;

  return {
    locale,
    // Deep merge: locale messages override default messages, with fallback for missing keys
    messages:
      locale !== defaultLocale
        ? deepmerge(defaultMessages, localeMessages)
        : defaultMessages,
  };
});
