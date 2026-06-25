"use client";

import { Languages } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { dictionaries } from "@/i18n/dictionaries";
import { type Locale, locales } from "@/i18n/config";

type LocaleSwitcherProps = {
  currentLocale: Locale;
  label: string;
};

export function LocaleSwitcher({ currentLocale, label }: LocaleSwitcherProps) {
  useEffect(() => {
    window.localStorage.setItem("gomoku-locale", currentLocale);
  }, [currentLocale]);

  return (
    <div className="locale-switcher" aria-label={label}>
      <Languages size={18} aria-hidden="true" />
      <div className="locale-links">
        {locales.map((locale) => (
          <Link
            aria-current={locale === currentLocale ? "page" : undefined}
            className={locale === currentLocale ? "active" : ""}
            href={`/${locale}`}
            key={locale}
            lang={locale}
            onClick={() => window.localStorage.setItem("gomoku-locale", locale)}
          >
            {dictionaries[locale].localeName}
          </Link>
        ))}
      </div>
    </div>
  );
}
