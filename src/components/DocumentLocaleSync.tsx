"use client";

import { useEffect } from "react";
import { getDirection, type Locale } from "@/i18n/config";

type DocumentLocaleSyncProps = {
  locale: Locale;
};

export function DocumentLocaleSync({ locale }: DocumentLocaleSyncProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  return null;
}
