import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Gomoku Online",
  description: "Play Gomoku online with a clean 15x15 board and fast game setup."
};

export default function RootRedirectLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
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
