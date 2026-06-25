import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDirection, isLocale } from "@/i18n/config";
import "../globals.css";

export const metadata: Metadata = {
  title: "Gomoku Online",
  description: "Play Gomoku online with a clean 15x15 board and fast game setup."
};

type LocaleLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
}>;

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <html lang={locale} dir={getDirection(locale)} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem("gomoku-theme");var theme=stored==="light"||stored==="dark"?stored:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme="light";}})();`
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
