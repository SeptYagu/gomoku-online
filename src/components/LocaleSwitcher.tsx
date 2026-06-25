"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Languages } from "lucide-react";
import { dictionaries } from "@/i18n/dictionaries";
import { type Locale, locales } from "@/i18n/config";

type LocaleSwitcherProps = {
  currentLocale: Locale;
  label: string;
};

const localeStorageKey = "gomoku-locale";
const localeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export function LocaleSwitcher({ currentLocale, label }: LocaleSwitcherProps) {
  useEffect(() => {
    persistLocale(currentLocale);
  }, [currentLocale]);

  return (
    <div className="locale-switcher" aria-label={label}>
      <Languages aria-hidden="true" focusable={false} />
      <div className="locale-links">
        {locales.map((locale) => (
          <Link
            aria-current={locale === currentLocale ? "page" : undefined}
            className={locale === currentLocale ? "active" : ""}
            href={`/${locale}`}
            key={locale}
            lang={locale}
            onClick={() => persistLocale(locale)}
          >
            {dictionaries[locale].localeName}
          </Link>
        ))}
      </div>
    </div>
  );
}

function persistLocale(locale: Locale) {
  window.localStorage.setItem(localeStorageKey, locale);
  document.cookie = [
    `${localeStorageKey}=${encodeURIComponent(locale)}`,
    `Max-Age=${localeCookieMaxAgeSeconds}`,
    "Path=/",
    "SameSite=Lax"
  ].join("; ");
}
