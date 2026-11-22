import type { Locale } from "@/i18n/config";

export function formatChatMessageTime(sentAt: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(sentAt));
}
