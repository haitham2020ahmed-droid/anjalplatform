import type { Metadata } from "next";
import "./globals.css";
import { DM_Serif_Display, Lexend } from "next/font/google";
import { Pwa } from "@/components/ui/pwa";
import { I18nProvider } from "@/i18n/client";
import { getLang } from "@/i18n/server";
import { dirOf } from "@/i18n";

export const metadata: Metadata = { title: { default: "Literise", template: "%s · Literise" }, applicationName: "Literise", description: "Literise — the English Language Arts platform of Al-Anjal Private Schools", manifest: "/manifest.webmanifest", icons: { icon: [{ url: "/brand/literise-mark.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png" }], apple: "/icons/apple-touch-icon.png" }, appleWebApp: { capable: true, title: "Literise", statusBarStyle: "default" } };
/**
 * Lexend — the font of the whole interface (headings 600, body 400–500): designed to make reading easier;
 * self-hosted at build by next/font (no request to Google at run time). Arabic interface words fall back to the
 * system's Arabic glyphs inside the same stack (Lexend has no Arabic letters).
 */
const lexend = Lexend({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"], display: "swap", variable: "--font-lexend" });
/** DM Serif Display: the Literise brand serif, ONLY for the wordmark and the sign-in headline (one weight, Latin only). */
const brandSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-literise" });

export const viewport = { themeColor: "#1f3a68" };

/** <html lang dir> follow the interface language (English default; Arabic = right-to-left). */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={dirOf(lang)} className={`${lexend.variable} ${brandSerif.variable}`}>
      <body className="min-h-screen"><I18nProvider lang={lang}>{children}</I18nProvider><Pwa /></body>
    </html>
  );
}
