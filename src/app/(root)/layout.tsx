import type { Metadata } from "next";
import { ThemeScript } from "@/components/ThemeScript";
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
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
