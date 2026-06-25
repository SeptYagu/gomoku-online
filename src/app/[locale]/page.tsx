import { notFound } from "next/navigation";
import { DocumentLocaleSync } from "@/components/DocumentLocaleSync";
import { GameShell } from "@/components/GameShell";
import { getDirection, isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

type LocalePageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocalePage({ params }: LocalePageProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const dictionary = getDictionary(localeParam);

  return (
    <div className="locale-page" dir={getDirection(localeParam)} lang={localeParam}>
      <DocumentLocaleSync locale={localeParam} />
      <GameShell dictionary={dictionary.game} locale={localeParam} />
    </div>
  );
}
