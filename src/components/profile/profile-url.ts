import type { Locale } from "@/i18n/config";

export function getProfileUrl(locale: Locale, playerId: string, displayName?: string): string {
  const trimmedPlayerId = playerId.trim();
  const params = new URLSearchParams();

  if (displayName?.trim()) {
    params.set("name", displayName.trim());
  }

  return `/${locale}/profile/${encodeURIComponent(trimmedPlayerId)}${params.size > 0 ? `?${params.toString()}` : ""}`;
}
