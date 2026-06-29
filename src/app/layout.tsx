import type { Metadata } from "next";
import "./globals.css";

// Note: system font stacks (defined in globals.css) are used instead of
// next/font/google so the app builds in air-gapped/offline environments
// (next/font/google fetches font files from Google at build time).

export const metadata: Metadata = {
  title: "AI Code Review",
  description: "Review GitHub PRs with line-by-line AI conversations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
