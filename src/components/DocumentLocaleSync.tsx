"use client";

import { getDirection, type Locale } from "@/i18n/config";
import { resolveCurrentTheme } from "@/lib/theme";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

type DocumentLocaleSyncProps = {
  locale: Locale;
};

export function DocumentLocaleSync({ locale }: DocumentLocaleSyncProps) {
  useIsomorphicLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);

    const theme = resolveCurrentTheme();
    if (document.documentElement.dataset.theme !== theme) {
      document.documentElement.dataset.theme = theme;
    }
  }, [locale]);

  return null;
}
