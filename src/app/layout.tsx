import type { Metadata } from "next";
import "./globals.css";
import { Lexend } from "next/font/google";
import { Pwa } from "@/components/ui/pwa";
import { I18nProvider } from "@/i18n/client";
import { getLang } from "@/i18n/server";
import { dirOf } from "@/i18n";

export const metadata: Metadata = { title: { default: "Al-Anjal English", template: "%s · Al-Anjal English" }, description: "English practice, reading and MAP preparation — Al-Anjal Private Schools", manifest: "/manifest.webmanifest", icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" }, appleWebApp: { capable: true, title: "Al-Anjal", statusBarStyle: "default" } };
/**
 * Lexend — the ONLY font on the platform (headings 600, body 400–500): designed to make reading easier;
 * self-hosted at build by next/font (no request to Google at run time). Arabic interface words fall back to the
 * system's Arabic glyphs inside the same stack (Lexend has no Arabic letters).
 */
const lexend = Lexend({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"], display: "swap", variable: "--font-lexend" });

export const viewport = { themeColor: "#1f3a68" };

/** <html lang dir> follow the interface language (English default; Arabic = right-to-left). */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={dirOf(lang)} className={lexend.variable}>
      <body className="min-h-screen"><I18nProvider lang={lang}>{children}</I18nProvider><Pwa /></body>
    </html>
  );
}
