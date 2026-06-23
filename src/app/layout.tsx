import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gomoku Online",
  description: "Play Gomoku online with a clean 15x15 board and fast game setup."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
