export const locales = ["en", "zh", "fr", "es", "ru", "ar"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const rtlLocales = ["ar"] as const;

const localeSet = new Set<string>(locales);
const rtlLocaleSet = new Set<string>(rtlLocales);

export function isLocale(value: string): value is Locale {
  return localeSet.has(value);
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return rtlLocaleSet.has(locale) ? "rtl" : "ltr";
}
