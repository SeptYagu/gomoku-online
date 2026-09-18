import { notFound } from "next/navigation";
import { DocumentLocaleSync } from "@/components/DocumentLocaleSync";
import { FeedbackPage } from "@/components/feedback/FeedbackPage";
import { getDirection, isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

type FeedbackPageRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function FeedbackPageRoute({ params }: FeedbackPageRouteProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam as Locale;
  const dictionary = getDictionary(locale);

  return (
    <div className="locale-page" dir={getDirection(locale)} lang={locale}>
      <DocumentLocaleSync locale={locale} />
      <FeedbackPage
        controlsDictionary={dictionary.game.controls}
        dictionary={dictionary.feedback}
        locale={locale}
      />
    </div>
  );
}
