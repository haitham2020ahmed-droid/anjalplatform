import type { Metadata } from "next";
import "./globals.css";
import { Hanken_Grotesk, IBM_Plex_Sans_Arabic, Young_Serif } from "next/font/google";
import { Pwa } from "@/components/ui/pwa";
import { I18nProvider } from "@/i18n/client";
import { getLang } from "@/i18n/server";
import { dirOf } from "@/i18n";
import { getTheme } from "@/server/ui/theme";

export const metadata: Metadata = { title: { default: "Literise", template: "%s · Literise" }, applicationName: "Literise", description: "Literise — the English Language Arts platform of Al-Anjal Private Schools", manifest: "/manifest.webmanifest", icons: { icon: [{ url: "/brand/literise-mark.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png" }], apple: "/icons/apple-touch-icon.png" }, appleWebApp: { capable: true, title: "Literise", statusBarStyle: "default" } };
/**
 * Fonts (Literise D1), self-hosted at build by next/font (no request to Google at run time):
 * Hanken Grotesk = the interface (body, buttons, tables) · Young Serif = H1 / H2, big numbers and the Literise wordmark
 * (one weight) · IBM Plex Sans Arabic = the Arabic interface (body and headings) and the Arabic line of the school logo
 * (Arabic letters only).
 */
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-hanken" });
const youngSerif = Young_Serif({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-young-serif" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600"], display: "swap", variable: "--font-plex-arabic" });

export const viewport = { themeColor: "#232a6e" };

/** <html lang dir> follow the interface language (English default; Arabic = right-to-left); data-theme = day | night | system. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);
  return (
    <html lang={lang} dir={dirOf(lang)} data-theme={theme} className={`${hanken.variable} ${youngSerif.variable} ${plexArabic.variable}`}>
      <body className="min-h-screen"><I18nProvider lang={lang}>{children}</I18nProvider><Pwa /></body>
    </html>
  );
}
