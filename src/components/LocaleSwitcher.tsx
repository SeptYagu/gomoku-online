"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type MouseEvent } from "react";
import { Languages } from "lucide-react";
import { dictionaries } from "@/i18n/dictionaries";
import { type Locale, locales } from "@/i18n/config";
import { computeLocaleSwitchHref } from "@/lib/locale-navigation";

type LocaleSwitcherProps = {
  currentLocale: Locale;
  label: string;
};

const localeStorageKey = "gomoku-locale";
const localeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

function subscribeToSearch(): () => void {
  return () => {};
}

function getClientSearchSnapshot(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function getServerSearchSnapshot(): string {
  return "";
}

export function LocaleSwitcher({ currentLocale, label }: LocaleSwitcherProps) {
  const pathname = usePathname() ?? `/${currentLocale}`;
  const router = useRouter();
  const clientSearch = useSyncExternalStore(
    subscribeToSearch,
    getClientSearchSnapshot,
    getServerSearchSnapshot
  );

  useEffect(() => {
    persistLocale(currentLocale);
  }, [currentLocale]);

  const handleLocaleClick = (e: MouseEvent<HTMLAnchorElement>, targetLocale: Locale, targetHref: string) => {
    persistLocale(targetLocale);

    const liveSearch = typeof window !== "undefined" ? window.location.search : "";
    const liveTargetHref = computeLocaleSwitchHref(pathname, liveSearch, targetLocale);

    if (liveTargetHref !== targetHref) {
      e.preventDefault();
      router.push(liveTargetHref);
    }
  };

  return (
    <div className="locale-switcher" aria-label={label}>
      <Languages aria-hidden="true" focusable={false} />
      <div className="locale-links">
        {locales.map((locale) => {
          const targetHref = computeLocaleSwitchHref(pathname, clientSearch, locale);
          return (
            <Link
              aria-current={locale === currentLocale ? "page" : undefined}
              className={locale === currentLocale ? "active" : ""}
              href={targetHref}
              key={locale}
              lang={locale}
              onClick={(e) => handleLocaleClick(e, locale, targetHref)}
            >
              {dictionaries[locale].localeName}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function persistLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localeStorageKey, locale);
  document.cookie = [
    `${localeStorageKey}=${encodeURIComponent(locale)}`,
    `Max-Age=${localeCookieMaxAgeSeconds}`,
    "Path=/",
    "SameSite=Lax"
  ].join("; ");
}
