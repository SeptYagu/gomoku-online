import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale, isLocale } from "@/i18n/config";

export default async function Home() {
  const localeCookie = (await cookies()).get("gomoku-locale")?.value;
  const locale = localeCookie && isLocale(localeCookie) ? localeCookie : defaultLocale;

  redirect(`/${locale}`);
}
