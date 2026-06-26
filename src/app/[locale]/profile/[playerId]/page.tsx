import { notFound } from "next/navigation";
import { PlayerProfilePage } from "@/components/profile/PlayerProfilePage";
import { getDirection, isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

type ProfileRouteProps = {
  params: Promise<{
    locale: string;
    playerId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProfileRoute({ params, searchParams }: ProfileRouteProps) {
  const { locale: localeParam, playerId } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const query = await searchParams;
  const name = getSingleQueryValue(query?.name);
  const decodedPlayerId = decodeURIComponent(playerId);
  const dictionary = getDictionary(localeParam);

  return (
    <div className="locale-page" dir={getDirection(localeParam)} lang={localeParam}>
      <PlayerProfilePage
        dictionary={dictionary.game}
        initialName={name}
        locale={localeParam as Locale}
        playerId={decodedPlayerId}
      />
    </div>
  );
}

function getSingleQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
